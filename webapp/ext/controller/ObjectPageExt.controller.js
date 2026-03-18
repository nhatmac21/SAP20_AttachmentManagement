sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment"
], function(ControllerExtension, JSONModel, MessageBox, MessageToast, Fragment) {
    "use strict";

    var MAX_FILE_SIZE = 10485760;
    var BIZ_OBJECT_SERVICE_ROOT = "/sap/opu/odata4/sap/zui_bizobj_bind/srvd/sap/zui_bizobj_srv/0001";
    var SAP_CLIENT = "324";

    return ControllerExtension.extend("zattach.zattachfe.ext.controller.ObjectPageExt", {
        
        onUploadNewVersion: function(oEvent) {
            console.log("Upload New Version button clicked");
            var oView = this.base.getView();
            var oContext = oView.getBindingContext();
            
            if (!oContext) {
                MessageBox.error("No attachment selected");
                return;
            }

            console.log("FileId:", oContext.getProperty("FileId"));
            // Load dialog fragment for file upload
            this._loadUploadDialog(oContext);
        },

        _loadUploadDialog: function(oContext) {
            var that = this;
            var oView = this.base.getView();
            var oVersionBoModel = this._ensureVersionBoModel();

            if (!this._oUploadDialog) {
                Fragment.load({
                    id: oView.getId() + "--uploadNewVersionFragment",
                    name: "zattach.zattachfe.ext.fragment.UploadNewVersion",
                    controller: this
                }).then(function(oDialog) {
                    that._oUploadDialog = oDialog;
                    that._sUploadFragmentId = oView.getId() + "--uploadNewVersionFragment";
                    oView.addDependent(oDialog);
                    that._oUploadDialog.setModel(oVersionBoModel, "bo");
                    that._oUploadDialog.setBindingContext(oContext);
                    that._resetVersionUploadState();
                    that._oUploadDialog.open();
                    that._loadVersionBizObjects();
                    // afterRendering on core:HTML handles drop zone init for first open
                }).catch(function(oError) {
                    console.error("Failed to load dialog:", oError);
                    MessageBox.error("Failed to load upload dialog: " + oError.message);
                });
            } else {
                // Reset state before reopening
                this._resetVersionUploadState();
                this._oUploadDialog.setModel(oVersionBoModel, "bo");
                this._oUploadDialog.setBindingContext(oContext);
                this._oUploadDialog.open();
                this._loadVersionBizObjects();
                // Re-attach drop zone events since DOM already exists
                setTimeout(function() {
                    that._initVersionDropZone();
                }, 150);
            }
        },

        _ensureVersionBoModel: function() {
            if (!this._oVersionBoModel) {
                this._oVersionBoModel = new JSONModel(this._getInitialVersionBoData());
            }

            return this._oVersionBoModel;
        },

        _getInitialVersionBoData: function() {
            return {
                items: [],
                busy: false,
                hasSelection: false,
                selectedBoId: "",
                selectedBoType: "",
                selectionText: "No business object selected"
            };
        },

        _getBizObjectCollectionUrl: function() {
            return BIZ_OBJECT_SERVICE_ROOT + "/BizObject?sap-client=" + SAP_CLIENT;
        },

        _getLinkToBoUrl: function(sFileId) {
            return BIZ_OBJECT_SERVICE_ROOT + "/Attachment(FileId=" + sFileId + ")/SAP__self.link_to_bo?sap-client=" + SAP_CLIENT;
        },

        _loadVersionBizObjects: function() {
            var oBoModel = this._ensureVersionBoModel();

            oBoModel.setProperty("/busy", true);

            fetch(this._getBizObjectCollectionUrl(), {
                method: "GET",
                credentials: "include",
                headers: {
                    "Accept": "application/json"
                }
            }).then(function(oResponse) {
                if (!oResponse.ok) {
                    return oResponse.text().then(function(sText) {
                        throw new Error(sText || ("Failed to load business objects with status " + oResponse.status));
                    });
                }

                return oResponse.json();
            }).then(function(oResult) {
                var aItems = (oResult && oResult.value ? oResult.value : []).map(function(oBizObject) {
                    return this._mapBizObject(oBizObject);
                }.bind(this));

                oBoModel.setProperty("/items", aItems);
                this._clearVersionSelectedBizObject();
            }.bind(this)).catch(function(oError) {
                oBoModel.setProperty("/items", []);
                this._clearVersionSelectedBizObject();
                MessageBox.error("Failed to load business objects: " + this._extractRequestErrorMessage(oError));
            }.bind(this)).finally(function() {
                oBoModel.setProperty("/busy", false);
            });
        },

        onRefreshVersionBizObjects: function() {
            this._loadVersionBizObjects();
        },

        _mapBizObject: function(oBizObject) {
            var sBoId = oBizObject.BO_ID || oBizObject.BoId || oBizObject.BOId || oBizObject.Boid || "";
            var sBoType = oBizObject.BoType || oBizObject.BO_TYPE || oBizObject.BOTYPE || oBizObject.Type || sBoId;
            var sDescription = oBizObject.Description || oBizObject.BoDescription || oBizObject.BO_DESCRIPTION || "";

            return {
                BoId: sBoId,
                BoType: sBoType,
                Description: sDescription,
                Selected: false
            };
        },

        onVersionBizObjectSelect: function(oEvent) {
            var bSelected = oEvent.getParameter("selected");
            var oContext = oEvent.getSource().getBindingContext("bo");
            var oBoModel = this._ensureVersionBoModel();
            var aItems = oBoModel.getProperty("/items") || [];
            var iSelectedIndex;

            if (!oContext) {
                return;
            }

            iSelectedIndex = parseInt(oContext.getPath().split("/").pop(), 10);
            aItems = aItems.map(function(oItem, iIndex) {
                return {
                    BoId: oItem.BoId,
                    BoType: oItem.BoType,
                    Description: oItem.Description,
                    Selected: bSelected && iIndex === iSelectedIndex
                };
            });

            oBoModel.setProperty("/items", aItems);

            if (bSelected && aItems[iSelectedIndex]) {
                this._setVersionSelectedBizObject(aItems[iSelectedIndex]);
                return;
            }

            this._clearVersionSelectedBizObject();
        },

        _setVersionSelectedBizObject: function(oBizObject) {
            var oBoModel = this._ensureVersionBoModel();

            oBoModel.setProperty("/hasSelection", true);
            oBoModel.setProperty("/selectedBoId", oBizObject.BoId);
            oBoModel.setProperty("/selectedBoType", oBizObject.BoType);
            oBoModel.setProperty("/selectionText", "Selected: " + oBizObject.BoType);
        },

        _clearVersionSelectedBizObject: function() {
            var oBoModel = this._ensureVersionBoModel();

            oBoModel.setProperty("/hasSelection", false);
            oBoModel.setProperty("/selectedBoId", "");
            oBoModel.setProperty("/selectedBoType", "");
            oBoModel.setProperty("/selectionText", "No business object selected");
        },

        _getUploadDialogControl: function(sId) {
            return this._sUploadFragmentId ? Fragment.byId(this._sUploadFragmentId, sId) : null;
        },

        // ── Drag-drop helpers ────────────────────────────────────────────

        _resetVersionUploadState: function() {
            this._oVersionFile = null;
            this._sVersionPreviewDataUrl = "";
            this._sVersionPreviewMimeType = "";
            if (this._oUploadDialog) {
                var oPreview = this._getUploadDialogControl("versionFilePreviewBox");
                var oFileUploader = this._getUploadDialogControl("versionFileUploader");

                if (oPreview) {
                    oPreview.setVisible(false);
                }

                if (oFileUploader) {
                    oFileUploader.clear();
                }

                this._oUploadDialog.setBusy(false);
            }

            this._updateVersionContentPreview();

            this._clearVersionSelectedBizObject();
        },

        onVersionDropZoneRendered: function() {
            this._initVersionDropZone();
        },

        _initVersionDropZone: function() {
            var that = this;
            var oDropZone = document.getElementById("versionDropZone");
            if (!oDropZone) { return; }

            if (oDropZone.dataset.bound === "true") { return; }
            oDropZone.dataset.bound = "true";

            // Prevent default browser behaviour for drag events
            ["dragenter", "dragover", "dragleave", "drop"].forEach(function(sEvent) {
                oDropZone.addEventListener(sEvent, function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                }, false);
            });

            // Visual feedback
            ["dragenter", "dragover"].forEach(function(sEvent) {
                oDropZone.addEventListener(sEvent, function() {
                    oDropZone.classList.add("dragOver");
                }, false);
            });
            ["dragleave", "drop"].forEach(function(sEvent) {
                oDropZone.addEventListener(sEvent, function() {
                    oDropZone.classList.remove("dragOver");
                }, false);
            });

            // Handle drop
            oDropZone.addEventListener("drop", function(e) {
                var aFiles = e.dataTransfer && e.dataTransfer.files;
                if (aFiles && aFiles.length > 0) {
                    that._handleVersionFile(aFiles[0]);
                }
            }, false);

            // Handle click → trigger hidden FileUploader
            oDropZone.addEventListener("click", function() {
                var oFileUploader = that._getUploadDialogControl("versionFileUploader");

                if (oFileUploader) {
                    var oInput = oFileUploader.$().find("input[type=file]")[0];
                    if (oInput) { oInput.click(); }
                }
            }, false);
        },

        onVersionFileChange: function(oEvent) {
            var aFiles = oEvent.getParameter("files");
            if (aFiles && aFiles.length > 0) {
                this._handleVersionFile(aFiles[0]);
            }
        },

        _handleVersionFile: function(oFile) {
            if (!oFile) { return; }

            if (oFile.size > MAX_FILE_SIZE) {
                MessageBox.error("File size exceeds the maximum allowed size of 10MB");
                return;
            }

            this._oVersionFile = oFile;

            // Show preview box
            var oPreview = this._getUploadDialogControl("versionFilePreviewBox");
            if (oPreview) {
                oPreview.setVisible(true);
            }

            // Update preview DOM elements
            this._updateVersionFilePreview(oFile);
            this._readVersionPreviewContent(oFile);
        },

        _readVersionPreviewContent: function(oFile) {
            var that = this;
            var oReader = new FileReader();

            oReader.onload = function(oEvent) {
                that._sVersionPreviewDataUrl = oEvent.target.result || "";
                that._sVersionPreviewMimeType = oFile.type || "";
                that._updateVersionContentPreview();
            };

            oReader.onerror = function() {
                that._sVersionPreviewDataUrl = "";
                that._sVersionPreviewMimeType = "";
                that._updateVersionContentPreview();
            };

            oReader.readAsDataURL(oFile);
        },

        _updateVersionContentPreview: function() {
            var oPreviewBox = this._getUploadDialogControl("versionContentPreviewBox");
            var oImagePreview = this._getUploadDialogControl("versionImagePreview");
            var oNoPreviewText = this._getUploadDialogControl("versionNoPreviewText");
            var sPreviewDataUrl = this._sVersionPreviewDataUrl || "";
            var sMimeType = (this._sVersionPreviewMimeType || "").toLowerCase();
            var bIsImage = sMimeType.indexOf("image/") === 0;

            if (!oPreviewBox || !oImagePreview || !oNoPreviewText) {
                return;
            }

            if (!sPreviewDataUrl) {
                oPreviewBox.setVisible(false);
                oImagePreview.setVisible(false);
                oNoPreviewText.setVisible(false);
                return;
            }

            oPreviewBox.setVisible(true);

            if (bIsImage) {
                oImagePreview.setContent("<img src='" + sPreviewDataUrl + "' style='max-width:100%; max-height:220px;' />");
                oImagePreview.setVisible(true);
                oNoPreviewText.setVisible(false);
                return;
            }

            oImagePreview.setContent("");
            oImagePreview.setVisible(false);
            oNoPreviewText.setVisible(true);
        },

        _updateVersionFilePreview: function(oFile) {
            setTimeout(function() {
                var oNameEl = document.getElementById("versionPreviewFileName");
                var oDetailsEl = document.getElementById("versionPreviewFileDetails");
                if (oNameEl) { oNameEl.textContent = oFile.name; }
                if (oDetailsEl) {
                    var iSizeKB = Math.round(oFile.size / 1024);
                    var sSize = iSizeKB > 1024
                        ? (iSizeKB / 1024).toFixed(2) + " MB"
                        : iSizeKB + " KB";
                    var sExt = oFile.name.split(".").pop().toUpperCase();
                    oDetailsEl.textContent = sExt + " \u2022 " + sSize;
                }
            }, 100);
        },

        onVersionFilePreviewRendered: function() {
            if (this._oVersionFile) {
                this._updateVersionFilePreview(this._oVersionFile);
            }
        },

        onVersionRemoveFile: function() {
            this._oVersionFile = null;
            this._sVersionPreviewDataUrl = "";
            this._sVersionPreviewMimeType = "";
            // Hide preview box
            var oPreview = this._getUploadDialogControl("versionFilePreviewBox");
            var oFileUploader = this._getUploadDialogControl("versionFileUploader");

            if (oPreview) {
                oPreview.setVisible(false);
            }

            if (oFileUploader) {
                oFileUploader.clear();
            }

            this._updateVersionContentPreview();
        },

        onUploadDialogConfirm: function() {
            var oBoModel = this._ensureVersionBoModel();
            var sSelectedBoId = oBoModel.getProperty("/selectedBoId");

            if (!this._oVersionFile) {
                MessageBox.error("Please select a file to upload");
                return;
            }

            if (!sSelectedBoId) {
                MessageBox.error("Please select a business object to link");
                return;
            }

            this._uploadNewVersion(this._oVersionFile, sSelectedBoId, oBoModel.getProperty("/selectedBoType"));
        },

        onUploadDialogCancel: function() {
            if (this._oUploadDialog) {
                this._resetVersionUploadState();
                this._oUploadDialog.close();
            }
        },

        _getVersionsTable: function() {
            var oView = this.base.getView();
            var aTables = oView.findAggregatedObjects(true, function(oControl) {
                return oControl &&
                    oControl.getId &&
                    oControl.getId().indexOf("::table::_Versions") > -1 && (
                        typeof oControl.getSelectedContexts === "function" ||
                        typeof oControl.getSelectedItems === "function"
                    );
            });

            return aTables && aTables.length > 0 ? aTables[0] : null;
        },

        _getSelectedContextFromTable: function() {
            var oTable = this._getVersionsTable();
            var aSelectedContexts;
            var aSelectedItems;

            if (!oTable) {
                return null;
            }

            if (typeof oTable.getSelectedContexts === "function") {
                aSelectedContexts = oTable.getSelectedContexts();
                if (aSelectedContexts && aSelectedContexts.length > 0) {
                    return aSelectedContexts[0];
                }
            }

            if (typeof oTable.getSelectedItems === "function") {
                aSelectedItems = oTable.getSelectedItems();
                if (aSelectedItems && aSelectedItems.length > 0 && aSelectedItems[0].getBindingContext) {
                    return aSelectedItems[0].getBindingContext();
                }
            }

            if (typeof oTable.getPlugins === "function") {
                var aPlugins = oTable.getPlugins();
                var oSelectionPlugin = aPlugins && aPlugins.find(function(oPlugin) {
                    return oPlugin && typeof oPlugin.getSelectedContexts === "function";
                });

                if (oSelectionPlugin) {
                    aSelectedContexts = oSelectionPlugin.getSelectedContexts();
                    if (aSelectedContexts && aSelectedContexts.length > 0) {
                        return aSelectedContexts[0];
                    }
                }
            }

            return null;
        },

        _getSelectedVersionContext: function(oEvent) {
            var oContextFromTable = this._getSelectedContextFromTable();

            if (oContextFromTable) {
                return oContextFromTable;
            }

            var aSelectedContexts = oEvent && oEvent.getParameter && (
                oEvent.getParameter("selectedContexts") ||
                oEvent.getParameter("contexts") ||
                oEvent.getParameter("bindingContexts")
            );

            if (aSelectedContexts && aSelectedContexts.length > 0) {
                return aSelectedContexts[0];
            }

            if (aSelectedContexts && !Array.isArray(aSelectedContexts)) {
                var aContextValues = Object.keys(aSelectedContexts).map(function(sKey) {
                    return aSelectedContexts[sKey];
                }).filter(Boolean);

                if (aContextValues.length > 0) {
                    return aContextValues[0];
                }
            }

            var oSource = oEvent && oEvent.getSource && oEvent.getSource();
            if (oSource && oSource.getBindingContext) {
                return oSource.getBindingContext();
            }

            return null;
        },

        _getServiceUrl: function() {
            var oModel = this.base.getView().getModel();
            return (oModel.sServiceUrl || "").replace(/\/$/, "");
        },

        _getAttachmentApiUrl: function(sFileId) {
            return this._getServiceUrl() + "/Attachments(FileId=" + sFileId + ")";
        },

        _getAttachmentActionUrl: function(sFileId, sActionName) {
            return this._getAttachmentApiUrl(sFileId) + "/com.sap.gateway.srvd.zui_attach_srv.v0001." + sActionName;
        },

        _fetchCsrfToken: function(sServiceRoot) {
            var that = this;
            var sRoot = (sServiceRoot || this._getServiceUrl()).replace(/\/$/, "");

            this._mCsrfTokens = this._mCsrfTokens || {};

            if (this._mCsrfTokens[sRoot]) {
                return Promise.resolve(this._mCsrfTokens[sRoot]);
            }

            return fetch(sRoot + "/", {
                method: "GET",
                credentials: "include",
                headers: {
                    "X-CSRF-Token": "Fetch",
                    "Accept": "application/json"
                }
            }).then(function(oResponse) {
                var sToken = oResponse.headers.get("x-csrf-token");

                if (!sToken) {
                    throw new Error("Unable to fetch CSRF token");
                }

                that._mCsrfTokens[sRoot] = sToken;
                return sToken;
            });
        },

        _sendApiRequest: function(sUrl, sMethod, oBody, sServiceRoot) {
            return this._fetchCsrfToken(sServiceRoot).then(function(sToken) {
                return fetch(sUrl, {
                    method: sMethod,
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "X-CSRF-Token": sToken
                    },
                    body: oBody ? JSON.stringify(oBody) : undefined
                });
            }).then(function(oResponse) {
                if (!oResponse.ok) {
                    return oResponse.text().then(function(sText) {
                        throw new Error(sText || ("Request failed with status " + oResponse.status));
                    });
                }

                if (oResponse.status === 204) {
                    return null;
                }

                return oResponse.json();
            });
        },

        _extractRequestErrorMessage: function(oError) {
            return oError && oError.message ? oError.message : "Unexpected error";
        },

        _linkAttachmentToBo: function(sFileId, sBoId) {
            return this._sendApiRequest(this._getLinkToBoUrl(sFileId), "POST", {
                BO_ID: sBoId
            }, BIZ_OBJECT_SERVICE_ROOT);
        },

        _base64ToBlob: function(sBase64Content, sMimeType) {
            var sBinary = atob(sBase64Content);
            var aBytes = new Uint8Array(sBinary.length);
            var iIndex;

            for (iIndex = 0; iIndex < sBinary.length; iIndex += 1) {
                aBytes[iIndex] = sBinary.charCodeAt(iIndex);
            }

            return new Blob([aBytes], {
                type: sMimeType || "application/octet-stream"
            });
        },

        _triggerFileDownload: function(oDownloadPayload) {
            var oPayload = oDownloadPayload && oDownloadPayload.value ? oDownloadPayload.value : oDownloadPayload;

            if (!oPayload || !oPayload.FileContent) {
                throw new Error("Download payload does not contain file content");
            }

            var oBlob = this._base64ToBlob(oPayload.FileContent, oPayload.MimeType);
            var sFileName = oPayload.FileName || "attachment";
            var sObjectUrl = URL.createObjectURL(oBlob);
            var oLink = document.createElement("a");

            oLink.href = sObjectUrl;
            oLink.download = sFileName;
            document.body.appendChild(oLink);
            oLink.click();
            document.body.removeChild(oLink);
            URL.revokeObjectURL(sObjectUrl);
        },

        onRollbackVersion: function(oEvent) {
            var that = this;
            var oContext = this._getSelectedVersionContext(oEvent);
            
            if (!oContext) {
                MessageBox.error("No version selected");
                return;
            }

            var sVersionNo = oContext.getProperty("VersionNo");
            var sFileName = oContext.getProperty("FileName");
            var oAttachmentContext = this.base.getView().getBindingContext();
            var sCurrentVersion = oAttachmentContext && oAttachmentContext.getProperty("CurrentVersion");

            if (sCurrentVersion === sVersionNo) {
                MessageToast.show("This version is already the current version");
                return;
            }
            
            MessageBox.confirm(
                "Do you want to rollback to version " + sVersionNo + " of " + sFileName + "?",
                {
                    onClose: function(sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            that._performRollback(oContext, sVersionNo);
                        }
                    }
                }
            );
        },

        onDownloadVersion: function(oEvent) {
            var that = this;
            var oContext = this._getSelectedVersionContext(oEvent);

            if (!oContext) {
                MessageBox.error("No version selected");
                return;
            }

            var sVersionNo = oContext.getProperty("VersionNo");
            var sFileId = oContext.getProperty("FileId");
            var sFileName = oContext.getProperty("FileName");
            var sUrl = this._getAttachmentActionUrl(sFileId, "download_version");

            this._sendApiRequest(sUrl, "POST", {
                VERSION_NO: sVersionNo
            }).then(function(oResponse) {
                that._triggerFileDownload(oResponse);
                MessageToast.show("Downloaded version " + sVersionNo + " of " + sFileName);
            }).catch(function(oError) {
                MessageBox.error("Failed to download version: " + oError.message);
            });
        },

        _performRollback: function(oVersionContext, sVersionNo) {
            var that = this;
            var sFileId = oVersionContext.getProperty("FileId");
            var sUrl = this._getAttachmentApiUrl(sFileId);

            this._sendApiRequest(sUrl, "PATCH", {
                CurrentVersion: sVersionNo
            }).then(function() {
                MessageToast.show("Successfully rolled back to version " + sVersionNo);
                that.base.getView().getModel().refresh();
            }).catch(function(oError) {
                var sErrorMsg = "Failed to rollback version";
                if (oError && oError.message) {
                    sErrorMsg += ": " + oError.message;
                }
                MessageBox.error(sErrorMsg);
            });
        },

        _uploadNewVersion: function(oFile, sSelectedBoId, sSelectedBoType) {
            var that = this;
            var oContext = this._oUploadDialog.getBindingContext();
            var sFileId = oContext.getProperty("FileId");
            var oModel = this.base.getView().getModel();

            this._oUploadDialog.setBusy(true);

            // Read file as base64
            var reader = new FileReader();
            reader.onload = function(e) {
                var base64Content = btoa(e.target.result);
                var sFileName = oFile.name;
                var aFileNameParts = sFileName.split(".");
                var sFileExtension = aFileNameParts[aFileNameParts.length - 1];
                var iFileSize = oFile.size;
                var sMimeType = oFile.type || "application/octet-stream";

                // Call OData action to create new version
                that._createVersionViaRBA(oModel, sFileId, {
                    FileName: sFileName,
                    FileExtension: sFileExtension,
                    MimeType: sMimeType,
                    FileSize: iFileSize,
                    FileContent: base64Content
                }, sSelectedBoId, sSelectedBoType);
            };
            reader.onerror = function() {
                that._oUploadDialog.setBusy(false);
                MessageBox.error("Failed to read the selected file");
            };
            reader.readAsBinaryString(oFile);
        },

        _createVersionViaRBA: function(oModel, sFileId, oVersionData, sSelectedBoId, sSelectedBoType) {
            var that = this;
            var bVersionCreated = false;
            // Ensure FileId is properly formatted
            var sPath = "/Attachments(" + sFileId + ")/_Versions";

            // Create new version via navigation
            var oListBinding = oModel.bindList(sPath);
            
            var oNewContext = oListBinding.create({
                FileId: sFileId,
                FileName: oVersionData.FileName,
                FileExtension: oVersionData.FileExtension,
                MimeType: oVersionData.MimeType,
                FileSize: oVersionData.FileSize,
                FileContent: oVersionData.FileContent
            }, true); // Skip refresh

            // Submit the batch immediately
            oModel.submitBatch("$auto").then(function() {
                return oNewContext.created();
            }).then(function() {
                bVersionCreated = true;
                return that._linkAttachmentToBo(sFileId, sSelectedBoId);
            }).then(function() {
                MessageToast.show("New version uploaded and linked to " + sSelectedBoType + " successfully");
                that._resetVersionUploadState();
                that._oUploadDialog.close();
                
                // Wait a bit then refresh to allow backend to process
                setTimeout(function() {
                    // Refresh only the versions table binding
                    var oView = that.base.getView();
                    var oObjectPage = oView.getContent()[0];
                    if (oObjectPage && oObjectPage.getSections) {
                        oObjectPage.getModel().refresh();
                    }
                }, 500);
            }).catch(function(oError) {
                var sErrorMsg = that._extractRequestErrorMessage(oError);

                if (bVersionCreated) {
                    MessageBox.warning("New version was uploaded but failed to link to the selected business object: " + sErrorMsg, {
                        onClose: function() {
                            that._resetVersionUploadState();
                            that._oUploadDialog.close();
                            that.base.getView().getModel().refresh();
                        }
                    });
                    return;
                }

                MessageBox.error("Failed to upload new version: " + sErrorMsg);
            }).finally(function() {
                that._oUploadDialog.setBusy(false);
            });
        },

        _createVersionViaAction: function(oModel, sFileId, oVersionData) {
            var that = this;
            var sActionPath = "/Attachments(FileId=" + sFileId + ")/com.sap.gateway.srvd.zui_attach_srv.v0001.upload_new_version";

            // Call OData action
            var oAction = oModel.bindContext(sActionPath);
            oAction.setParameter("FILE_NAME", oVersionData.FileName);
            oAction.setParameter("FILE_EXTENSION", oVersionData.FileExtension);
            oAction.setParameter("MIME_TYPE", oVersionData.MimeType);
            oAction.setParameter("FILE_SIZE", oVersionData.FileSize);
            oAction.setParameter("FILE_CONTENT", oVersionData.FileContent);

            oAction.execute().then(function() {
                MessageToast.show("New version uploaded successfully");
                that._oUploadDialog.close();
                
                // Refresh the versions table
                that.base.getView().getModel().refresh();
            }).catch(function(oError) {
                MessageBox.error("Failed to upload new version: " + oError.message);
            });
        }
    });
});
