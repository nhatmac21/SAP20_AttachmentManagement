sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "zattach/zattachfe/model/formatter"
], function (Controller, JSONModel, MessageToast, MessageBox, SelectDialog, StandardListItem, formatter) {
    "use strict";

    var MAX_FILE_SIZE = 10485760;
    var BIZ_OBJECT_SERVICE_ROOT = "/sap/opu/odata4/sap/zui_bizobj_bind/srvd/sap/zui_bizobj_srv/0001";
    var SAP_CLIENT = "324";

    return Controller.extend("zattach.zattachfe.controller.CreateAttachment", {
        formatter: formatter,
        
        onInit: function () {
            var oUploadModel = new JSONModel(this._getInitialUploadData());
            var oBizObjectModel = new JSONModel(this._getInitialBizObjectData());

            this.getView().setModel(oUploadModel, "upload");
            this.getView().setModel(oBizObjectModel, "bo");

            this._mCsrfTokens = {};

            var oRouter = this.getOwnerComponent().getRouter();
            if (oRouter) {
                oRouter.getRoute("CreateAttachment").attachPatternMatched(this._onRouteMatched, this);
            }
        },

        _getInitialUploadData: function () {
            return {
                Title: "",
                FileName: "",
                FileExtension: "",
                MimeType: "",
                FileSize: 0,
                FileContent: "",
                IsActive: true,
                busy: false
            };
        },

        _getInitialBizObjectData: function () {
            return {
                items: [],
                busy: false,
                hasItems: false,
                hasSelection: false,
                selectedBoId: "",
                selectedBoType: "",
                selectionText: "No business object selected"
            };
        },

        _onRouteMatched: function () {
            this._resetForm();
        },

        onOpenBoSearchHelp: function () {
            this._openBoSearchHelpDialog("");
        },

        _openBoSearchHelpDialog: function (sSearchText) {
            var oView = this.getView();

            if (!this._oBoSearchModel) {
                this._oBoSearchModel = new JSONModel({
                    items: []
                });
            }

            if (!this._oBoSearchDialog) {
                this._oBoSearchDialog = new SelectDialog({
                    title: "Select BO Type",
                    rememberSelections: false,
                    search: this.onBoSearchHelpSearch.bind(this),
                    liveChange: this.onBoSearchHelpSearch.bind(this),
                    confirm: this.onBoSearchHelpConfirm.bind(this),
                    cancel: this.onBoSearchHelpCancel.bind(this),
                    items: {
                        path: "boSearch>/items",
                        template: new StandardListItem({
                            title: "{boSearch>BoType}",
                            description: "{boSearch>Description}"
                        })
                    }
                });

                this._oBoSearchDialog.setModel(this._oBoSearchModel, "boSearch");
                oView.addDependent(this._oBoSearchDialog);
            }

            this._loadBoSearchResults(sSearchText).then(function () {
                this._oBoSearchDialog.open(sSearchText || "");
            }.bind(this));
        },

        onBoSearchHelpSearch: function (oEvent) {
            this._loadBoSearchResults(oEvent.getParameter("value") || "");
        },

        onBoSearchHelpConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oContext;
            var oSelectedBizObject;

            if (!oSelectedItem) {
                return;
            }

            oContext = oSelectedItem.getBindingContext("boSearch");
            oSelectedBizObject = oContext && oContext.getObject();

            if (oSelectedBizObject) {
                this._setSelectedBizObject(oSelectedBizObject);
            }
        },

        onBoSearchHelpCancel: function () {
            return;
        },

        _loadBoSearchResults: function (sSearchText) {
            var oBizObjectModel = this.getView().getModel("bo");

            oBizObjectModel.setProperty("/busy", true);

            return fetch(this._getBizObjectCollectionUrl(sSearchText, 30), {
                method: "GET",
                credentials: "include",
                headers: {
                    "Accept": "application/json"
                }
            }).then(function (oResponse) {
                if (!oResponse.ok) {
                    return oResponse.text().then(function (sText) {
                        throw new Error(sText || ("Failed to load business objects with status " + oResponse.status));
                    });
                }

                return oResponse.json();
            }).then(function (oResult) {
                var aItems = (oResult && oResult.value ? oResult.value : []).map(function (oBizObject) {
                    return this._mapBizObject(oBizObject);
                }.bind(this));

                this._oBoSearchModel.setProperty("/items", aItems);
            }.bind(this)).catch(function (oError) {
                this._oBoSearchModel.setProperty("/items", []);
                MessageBox.error("Failed to search business objects: " + this._extractErrorMessage(oError));
            }.bind(this)).finally(function () {
                oBizObjectModel.setProperty("/busy", false);
            });
        },

        _mapBizObject: function (oBizObject) {
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

        _setSelectedBizObject: function (oBizObject) {
            var oBizObjectModel = this.getView().getModel("bo");

            oBizObjectModel.setProperty("/hasSelection", true);
            oBizObjectModel.setProperty("/selectedBoId", oBizObject.BoId);
            oBizObjectModel.setProperty("/selectedBoType", oBizObject.BoType);
            oBizObjectModel.setProperty("/selectionText", "Selected: " + oBizObject.BoType);
        },

        _clearSelectedBizObject: function () {
            var oBizObjectModel = this.getView().getModel("bo");

            oBizObjectModel.setProperty("/hasSelection", false);
            oBizObjectModel.setProperty("/selectedBoId", "");
            oBizObjectModel.setProperty("/selectedBoType", "");
            oBizObjectModel.setProperty("/selectionText", "No business object selected");
        },

        _getBizObjectCollectionUrl: function (sSearchText, iTop) {
            var iResultTop = iTop || 30;
            var sSearch = String(sSearchText || "").trim();
            var sUrl = BIZ_OBJECT_SERVICE_ROOT + "/BizObject?sap-client=" + SAP_CLIENT + "&$top=" + iResultTop;

            if (sSearch) {
                sUrl += "&$filter=" + encodeURIComponent("contains(BoType,'" + this._escapeODataValue(sSearch) + "')");
            }

            return sUrl;
        },

        _escapeODataValue: function (sValue) {
            return String(sValue || "").replace(/'/g, "''");
        },

        _getLinkToBoUrl: function (sFileId) {
            return BIZ_OBJECT_SERVICE_ROOT + "/Attachment(FileId=" + sFileId + ")/SAP__self.link_to_bo?sap-client=" + SAP_CLIENT;
        },

        _fetchCsrfToken: function (sServiceRoot) {
            if (this._mCsrfTokens[sServiceRoot]) {
                return Promise.resolve(this._mCsrfTokens[sServiceRoot]);
            }

            return fetch(sServiceRoot + "/", {
                method: "GET",
                credentials: "include",
                headers: {
                    "X-CSRF-Token": "Fetch",
                    "Accept": "application/json"
                }
            }).then(function (oResponse) {
                var sToken = oResponse.headers.get("x-csrf-token");

                if (!sToken) {
                    throw new Error("Unable to fetch CSRF token");
                }

                this._mCsrfTokens[sServiceRoot] = sToken;
                return sToken;
            }.bind(this));
        },

        _sendApiRequest: function (sServiceRoot, sUrl, sMethod, oBody) {
            return this._fetchCsrfToken(sServiceRoot).then(function (sToken) {
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
            }).then(function (oResponse) {
                if (!oResponse.ok) {
                    return oResponse.text().then(function (sText) {
                        throw new Error(sText || ("Request failed with status " + oResponse.status));
                    });
                }

                if (oResponse.status === 204) {
                    return null;
                }

                return oResponse.text().then(function (sText) {
                    return sText ? JSON.parse(sText) : null;
                });
            });
        },

        _linkAttachmentToBo: function (sFileId, sBoId) {
            return this._sendApiRequest(
                BIZ_OBJECT_SERVICE_ROOT,
                this._getLinkToBoUrl(sFileId),
                "POST",
                {
                    BO_ID: sBoId
                }
            );
        },

        _extractErrorMessage: function (oError) {
            return oError && oError.message ? oError.message : "Unexpected error";
        },

        _getFileUploader: function () {
            return this.byId("createAttachmentFileUploader");
        },

        onDropZoneRendered: function () {
            var that = this;
            var dropZone = document.getElementById("dropZone");
            
            if (!dropZone) {
                return;
            }

            if (dropZone.dataset.bound === "true") {
                return;
            }

            dropZone.dataset.bound = "true";

            // Prevent default drag behaviors
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, preventDefaults, false);
                document.body.addEventListener(eventName, preventDefaults, false);
            });

            function preventDefaults(e) {
                e.preventDefault();
                e.stopPropagation();
            }

            // Highlight drop zone when item is dragged over it
            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, function() {
                    dropZone.classList.add('dragOver');
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, function() {
                    dropZone.classList.remove('dragOver');
                }, false);
            });

            // Handle dropped files
            dropZone.addEventListener('drop', function(e) {
                var dt = e.dataTransfer;
                var files = dt.files;
                
                if (files.length > 0) {
                    that.handleFile(files[0]);
                }
            }, false);

            // Handle click to open file dialog
            dropZone.addEventListener('click', function() {
                var fileUploader = that._getFileUploader();
                if (fileUploader) {
                    var fileInput = fileUploader.$().find("input[type=file]")[0];
                    if (fileInput) {
                        fileInput.click();
                    }
                }
            }, false);
        },

        handleFile: function(oFile) {
            if (!oFile) {
                return;
            }

            var oUploadModel = this.getView().getModel("upload");
            var sFileName = oFile.name;
            var sFileExtension = sFileName.split('.').pop().toUpperCase();
            var sMimeType = oFile.type || "application/octet-stream";
            var iFileSize = oFile.size;

            // Check file size (max 10MB)
            if (iFileSize > MAX_FILE_SIZE) {
                MessageBox.error("File size exceeds maximum allowed size of 10MB");
                return;
            }

            // Update model with file info
            oUploadModel.setProperty("/FileName", sFileName);
            oUploadModel.setProperty("/FileExtension", sFileExtension);
            oUploadModel.setProperty("/MimeType", sMimeType);
            oUploadModel.setProperty("/FileSize", iFileSize);

            // Update preview UI
            this.updateFilePreview();

            // Read file and convert to Base64
            var oReader = new FileReader();
            var that = this;

            oReader.onload = function (e) {
                var sBase64 = e.target.result;
                // Remove data URL prefix
                if (sBase64.indexOf(',') > -1) {
                    sBase64 = sBase64.split(',')[1];
                }
                oUploadModel.setProperty("/FileContent", sBase64);
                MessageToast.show("File loaded successfully");
            };

            oReader.onerror = function () {
                MessageBox.error("Error reading file");
            };

            oReader.readAsDataURL(oFile);
        },

        updateFilePreview: function() {
            var oUploadModel = this.getView().getModel("upload");
            var oData = oUploadModel.getData();
            
            // Update preview elements if they exist
            setTimeout(function() {
                var previewName = document.getElementById("previewFileName");
                var previewDetails = document.getElementById("previewFileDetails");
                
                if (previewName) {
                    previewName.textContent = oData.FileName;
                }
                if (previewDetails) {
                    var sizeFormatted = this.formatter.formatFileSize(oData.FileSize);
                    previewDetails.textContent = oData.FileExtension + " • " + sizeFormatted;
                }
            }.bind(this), 100);
        },

        onFilePreviewRendered: function() {
            this.updateFilePreview();
        },

        onFileInfoRendered: function() {
            var oUploadModel = this.getView().getModel("upload");
            var oData = oUploadModel.getData();
            
            setTimeout(function() {
                var infoFileName = document.getElementById("infoFileName");
                var infoFileExtension = document.getElementById("infoFileExtension");
                var infoMimeType = document.getElementById("infoMimeType");
                var infoFileSize = document.getElementById("infoFileSize");
                
                if (infoFileName) infoFileName.textContent = oData.FileName;
                if (infoFileExtension) infoFileExtension.textContent = oData.FileExtension;
                if (infoMimeType) infoMimeType.textContent = oData.MimeType;
                if (infoFileSize) infoFileSize.textContent = this.formatter.formatFileSize(oData.FileSize);
            }.bind(this), 100);
        },

        onFileChange: function (oEvent) {
            var oFile = oEvent.getParameter("files")[0];
            this.handleFile(oFile);
        },

        onRemoveFile: function() {
            var oUploadModel = this.getView().getModel("upload");
            oUploadModel.setProperty("/FileName", "");
            oUploadModel.setProperty("/FileExtension", "");
            oUploadModel.setProperty("/MimeType", "");
            oUploadModel.setProperty("/FileSize", 0);
            oUploadModel.setProperty("/FileContent", "");
            
            // Clear file uploader
            var oFileUploader = this._getFileUploader();
            if (oFileUploader) {
                oFileUploader.clear();
            }
            
            MessageToast.show("File removed");
        },

        onCreateAttachment: function () {
            var oUploadModel = this.getView().getModel("upload");
            var oBizObjectModel = this.getView().getModel("bo");
            var oData = oUploadModel.getData();
            var sSelectedBoId = oBizObjectModel.getProperty("/selectedBoId");
            var sSelectedBoType = oBizObjectModel.getProperty("/selectedBoType");
            var oModel = this.getView().getModel();
            var oPayload;
            var oContext;
            var sCreatedFileId = "";

            // Validate required fields
            if (!oData.Title) {
                MessageBox.error("Please enter a title");
                return;
            }

            if (!oData.FileContent) {
                MessageBox.error("Please select a file to upload");
                return;
            }

            if (!sSelectedBoId) {
                MessageBox.error("Please select a business object to link");
                return;
            }

            // Set busy state
            oUploadModel.setProperty("/busy", true);

            // Prepare payload for deep insert (Attachment with nested Version)
            oPayload = {
                Title: oData.Title,
                IsActive: oData.IsActive,
                EditLock: false,
                _Versions: [{
                    FileName: oData.FileName,
                    FileExtension: oData.FileExtension,
                    MimeType: oData.MimeType,
                    FileSize: oData.FileSize,
                    FileContent: oData.FileContent
                }]
            };

            // Create new attachment with nested version (Deep Insert)
            var oListBinding = oModel.bindList("/Attachments");
            oContext = oListBinding.create(oPayload);

            // Handle success/error
            oContext.created().then(function () {
                return oContext.requestObject();
            }).then(function (oCreatedAttachment) {
                sCreatedFileId = oCreatedAttachment && oCreatedAttachment.FileId;

                if (!sCreatedFileId) {
                    throw new Error("Attachment was created but FileId was not returned by the backend");
                }

                return this._linkAttachmentToBo(sCreatedFileId, sSelectedBoId);
            }.bind(this)).then(function () {
                MessageBox.success("Attachment created and linked to " + sSelectedBoType + " successfully!", {
                    onClose: function () {
                        this._resetForm();
                        this.getOwnerComponent().getRouter().navTo("AttachmentListList");
                    }.bind(this)
                });
            }.bind(this)).catch(function (oError) {
                var sErrorMsg;

                if (sCreatedFileId) {
                    sErrorMsg = "Attachment was created but failed to link to the selected business object: " + this._extractErrorMessage(oError);
                    MessageBox.warning(sErrorMsg, {
                        onClose: function () {
                            this._resetForm();
                            this.getOwnerComponent().getRouter().navTo("AttachmentListObjectPage", {
                                key: sCreatedFileId
                            });
                        }.bind(this)
                    });
                    return;
                }

                sErrorMsg = "Error creating attachment: " + this._extractErrorMessage(oError);
                MessageBox.error(sErrorMsg);
            }.bind(this)).finally(function () {
                oUploadModel.setProperty("/busy", false);
            });
        },

        onUploadAttachmentAction: function () {
            this.onCreateAttachment();
        },

        _resetForm: function () {
            var oUploadModel = this.getView().getModel("upload");
            var oBizObjectModel = this.getView().getModel("bo");

            oUploadModel.setData(this._getInitialUploadData());

            if (oBizObjectModel) {
                var aItems = oBizObjectModel.getProperty("/items") || [];
                oBizObjectModel.setProperty("/items", aItems.map(function (oItem) {
                    return {
                        BoId: oItem.BoId,
                        BoType: oItem.BoType,
                        Description: oItem.Description,
                        Selected: false
                    };
                }));
                this._clearSelectedBizObject();
            }

            var oFileUploader = this._getFileUploader();
            if (oFileUploader) {
                oFileUploader.clear();
            }
        },

        onCancelUpload: function () {
            this._resetForm();
            if (this.getOwnerComponent().getRouter()) {
                this.getOwnerComponent().getRouter().navTo("AttachmentListList");
            }
        }
    });
});
