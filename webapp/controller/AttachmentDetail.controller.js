sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageBox, MessageToast) {
    "use strict";

    var ATTACH_SERVICE_ROOT = "/sap/opu/odata4/sap/zui_attach_bind/srvd/sap/zui_attach_srv/0001";
    var BIZ_OBJECT_SERVICE_ROOT = "/sap/opu/odata4/sap/zui_bizobj_bind/srvd/sap/zui_bizobj_srv/0001";
    var SAP_CLIENT = "324";

    return Controller.extend("zattach.zattachfe.controller.AttachmentDetail", {
        onInit: function () {
            console.log("AttachmentDetail controller initialized");
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter.getRoute("AttachmentDetail").attachPatternMatched(this._onRouteMatched, this);
            this._mCsrfTokens = {};

            // Initialize view model (JSON model, not OData)
            var oViewModel = new JSONModel({
                FileId: "",
                FileName: "",
                FileExtension: "",
                MimeType: "",
                FileSize: 0,
                VersionNo: "",
                Title: "",
                CurrentVersion: "",
                IsActive: false,
                Erdat: "",
                Erzet: "",
                Ernam: "",
                Aedat: "",
                Aezet: "",
                Aenam: "",
                EditLock: false,
                versions: [],
                auditTrail: [],
                linkBo: [],
                busy: false
            });
            this.getView().setModel(oViewModel, "view");
        },

        _onRouteMatched: function (oEvent) {
            console.log("ROUTE MATCHED");
            var sFileId = oEvent.getParameter("arguments").id;
            if (sFileId) {
                this._loadAttachmentDetail(sFileId);
            }
        },

        _loadAttachmentDetail: function (sFileId) {
            var oViewModel = this.getView().getModel("view");

            this._resetDetailModel();
            oViewModel.setProperty("/busy", true);
            console.log("=== Loading Attachment Detail for FileId: " + sFileId + " ===");

            var pAttachment = this._getAttachmentById(sFileId).then(function (oAttachment) {
                console.log("✓ Raw API Response (Attachment):", oAttachment);
                this._applyAttachmentData(oAttachment, sFileId);
            }.bind(this)).catch(function (oError) {
    MessageBox.error("Failed to load attachment: " + oError.message);
            });

            var pVersions = this._loadVersions(sFileId).catch(function (oError) {
                console.error("✗ Error loading versions:", oError);
                MessageToast.show("Failed to load versions");
            });

            var pAuditTrail = this._loadAuditTrail(sFileId).catch(function (oError) {
                console.warn("⚠ Audit trail load failed:", oError);
            });

            var pLinkedObjects = this._loadLinkedObjects(sFileId).catch(function (oError) {
                console.warn("⚠ Linked objects load failed:", oError);
            });

            Promise.allSettled([pAttachment, pVersions, pAuditTrail, pLinkedObjects]).then(function () {
                oViewModel.setProperty("/busy", false);
            });
        },

        _loadVersions: function (sFileId) {
            var oViewModel = this.getView().getModel("view");

            console.log("=== Loading Versions for FileId: " + sFileId + " ===");

            return this._sendGetRequest(this._getVersionsUrl(sFileId)).then(function (oData) {
                console.log("✓ Raw API Response (Versions):", oData);

                var aVersions = Array.isArray(oData && oData.value) ? oData.value : [];
                console.log("✓ Found " + aVersions.length + " versions in response");

                aVersions.forEach(function (oVersion, index) {
                    console.log("  Version " + (index + 1) + ":", {
                        VersionNo: oVersion.VersionNo,
                        FileName: oVersion.FileName,
                        FileSize: oVersion.FileSize,
                        Ernam: oVersion.Ernam,
                        Erdat: oVersion.Erdat,
                        Erzet: oVersion.Erzet
                    });
                });

                oViewModel.setProperty("/versions", aVersions);

                if (aVersions.length > 0 && !oViewModel.getProperty("/FileName")) {
                    this._applyVersionFallbackData(aVersions[0], sFileId);
                }
            }.bind(this)).catch(function (oError) {
                console.error("✗ Error loading versions:", oError);
                oViewModel.setProperty("/versions", []);
                throw oError;
            });
        },

        _resetDetailModel: function () {
            var oViewModel = this.getView().getModel("view");

            oViewModel.setProperty("/FileId", "");
            oViewModel.setProperty("/FileName", "");
            oViewModel.setProperty("/FileExtension", "");
            oViewModel.setProperty("/MimeType", "");
            oViewModel.setProperty("/FileSize", 0);
            oViewModel.setProperty("/VersionNo", "");
            oViewModel.setProperty("/Title", "");
            oViewModel.setProperty("/CurrentVersion", "");
            oViewModel.setProperty("/IsActive", false);
            oViewModel.setProperty("/Erdat", "");
            oViewModel.setProperty("/Erzet", "");
            oViewModel.setProperty("/Ernam", "");
            oViewModel.setProperty("/Aedat", "");
            oViewModel.setProperty("/Aezet", "");
            oViewModel.setProperty("/Aenam", "");
            oViewModel.setProperty("/EditLock", false);
            oViewModel.setProperty("/versions", []);
            oViewModel.setProperty("/auditTrail", []);
            oViewModel.setProperty("/linkBo", []);
        },

        _loadAuditTrail: function (sFileId) {
            var oViewModel = this.getView().getModel("view");
            
            console.log("=== Loading Audit Trail for FileId: " + sFileId + " ===");

            return Promise.all([
                this._sendGetRequest(this._getAuditTrailUrl(sFileId)),
                this._sendGetRequest(this._getAuditUrl(sFileId))
            ]).then(function (aResponses) {
                var aAuditTrail = this._extractCollection(aResponses[0]).map(this._normalizeAuditRecord.bind(this));
                var aAudit = this._extractCollection(aResponses[1]).map(this._normalizeAuditRecord.bind(this));
                var aCombined = aAuditTrail.concat(aAudit);

                console.log("✓ Raw API Response (Audit Trail):", aResponses[0]);
                console.log("✓ Raw API Response (Audit):", aResponses[1]);
                console.log("✓ Combined audit records:", aCombined.length);

                oViewModel.setProperty("/auditTrail", aCombined);
                oViewModel.setProperty("/linkBo", []);
            }.bind(this)).catch(function (oError) {
                console.warn("⚠ Audit trail API failed:", oError);
                oViewModel.setProperty("/auditTrail", []);
                oViewModel.setProperty("/linkBo", []);
            });
        },

        _loadLinkedObjects: function (sFileId) {
            var oViewModel = this.getView().getModel("view");
            var sListUrl = BIZ_OBJECT_SERVICE_ROOT + "/BizObjectAttachmentLink?sap-client=" + SAP_CLIENT + "&$filter=" + encodeURIComponent("FileId eq " + sFileId);

            console.log("=== Loading Linked Objects for FileId: " + sFileId + " ===");

            return this._sendGetRequest(sListUrl, BIZ_OBJECT_SERVICE_ROOT).then(function (oData) {
                var aLinkedObjects = this._extractCollection(oData);

                if (aLinkedObjects.length === 0 && oData && typeof oData === "object") {
                    aLinkedObjects = [oData];
                }

                return Promise.all(aLinkedObjects.map(function (oLinkRecord) {
                    var oNormalizedLink = this._normalizeLinkedObject(oLinkRecord);
                    var sBoId = oNormalizedLink.BoId;
                    var sRecordFileId = oNormalizedLink.FileId || sFileId;

                    if (!sBoId || !sRecordFileId) {
                        return Promise.resolve(oNormalizedLink);
                    }

                    return this._sendGetRequest(this._getBizObjectUrl(sBoId), BIZ_OBJECT_SERVICE_ROOT).then(function (oBizObjectData) {
                        return this._mergeLinkedObjectData(oNormalizedLink, oBizObjectData);
                    }.bind(this)).catch(function () {
                        return oNormalizedLink;
                    });
                }.bind(this))).then(function (aMergedLinkedObjects) {
                    console.log("✓ Raw API Response (Linked Objects):", oData);
                    console.log("✓ Combined linked objects:", aMergedLinkedObjects.length);

                    oViewModel.setProperty("/linkBo", aMergedLinkedObjects);
                });
            }.bind(this)).catch(function (oError) {
                console.warn("⚠ Linked objects API failed:", oError);
                oViewModel.setProperty("/linkBo", []);
                throw oError;
            });
        },

        _applyAttachmentData: function (oAttachment, sFileId) {
            var oViewModel = this.getView().getModel("view");
            var oData = oAttachment || {};

            oViewModel.setProperty("/FileId", oData.FileId || sFileId || "");
            oViewModel.setProperty("/Title", oData.Title || oData.FileName || "");
            oViewModel.setProperty("/FileName", oData.FileName || "");
            oViewModel.setProperty("/FileExtension", oData.FileExtension || "");
            oViewModel.setProperty("/MimeType", oData.MimeType || "");
            oViewModel.setProperty("/FileSize", oData.FileSize || 0);
            oViewModel.setProperty("/CurrentVersion", oData.CurrentVersion || oData.VersionNo || "");
            oViewModel.setProperty("/IsActive", oData.IsActive === true);
            oViewModel.setProperty("/Erdat", oData.Erdat || "");
            oViewModel.setProperty("/Erzet", oData.Erzet || "");
            oViewModel.setProperty("/Ernam", oData.Ernam || "");
            oViewModel.setProperty("/Aedat", oData.Aedat || "");
            oViewModel.setProperty("/Aezet", oData.Aezet || "");
            oViewModel.setProperty("/Aenam", oData.Aenam || "");
            oViewModel.setProperty("/EditLock", oData.EditLock === true);
            oViewModel.setProperty("/VersionNo", oData.VersionNo || oData.CurrentVersion || "");
        },

        _applyVersionFallbackData: function (oVersion, sFileId) {
            var oViewModel = this.getView().getModel("view");
            var oData = oVersion || {};

            oViewModel.setProperty("/FileId", oData.FileId || sFileId || "");
            oViewModel.setProperty("/Title", oData.Title || oData.FileName || "");
            oViewModel.setProperty("/FileName", oData.FileName || "");
            oViewModel.setProperty("/FileExtension", oData.FileExtension || "");
            oViewModel.setProperty("/MimeType", oData.MimeType || "");
            oViewModel.setProperty("/FileSize", oData.FileSize || 0);
            oViewModel.setProperty("/CurrentVersion", oData.CurrentVersion || oData.VersionNo || "");
            oViewModel.setProperty("/IsActive", oData.IsActive === true);
            oViewModel.setProperty("/Erdat", oData.Erdat || "");
            oViewModel.setProperty("/Erzet", oData.Erzet || "");
            oViewModel.setProperty("/Ernam", oData.Ernam || "");
            oViewModel.setProperty("/VersionNo", oData.VersionNo || oData.CurrentVersion || "");
        },

        _getAttachmentById: function (sFileId) {
            return this._sendGetRequest(this._getAttachmentUrl(sFileId)).then(function (oData) {
                if (oData && !oData.error) {
                    return oData;
                }

                throw new Error("Attachment response is empty or invalid");
            });
        },

        _buildUrl: function (sRelativePath) {
            return ATTACH_SERVICE_ROOT + sRelativePath + "?sap-client=" + SAP_CLIENT;
        },

        _getAttachmentUrl: function (sFileId) {
            return this._buildUrl("/Attachments(FileId=" + sFileId + ")");
        },

        _getVersionsUrl: function (sFileId) {
            return this._buildUrl("/Attachments(FileId=" + sFileId + ")/_Versions");
        },

        _getAuditTrailUrl: function (sFileId) {
            return this._buildUrl("/Attachments(FileId=" + sFileId + ")/_Audit");
        },

        _getAuditUrl: function (sFileId) {
            return this._buildUrl("/Attachments(FileId=" + sFileId + ")/_Audit");
        },

        _getBizObjectUrl: function (sBoId) {
            return BIZ_OBJECT_SERVICE_ROOT + "/BizObject(BoId=" + sBoId + ")?sap-client=" + SAP_CLIENT;
        },

        _getUnlinkAttachmentUrl: function (sBoId, sFileId) {
            return BIZ_OBJECT_SERVICE_ROOT + "/BizObjectAttachmentLink(BoId=" + sBoId + ",FileId=" + sFileId + ")?sap-client=" + SAP_CLIENT;
        },

        _getDownloadVersionUrl: function (sFileId) {
            return this._buildUrl("/Attachments(FileId=" + sFileId + ")/com.sap.gateway.srvd.zui_attach_srv.v0001.download_version");
        },

        _normalizeAuditRecord: function (oRecord) {
            var oData = oRecord || {};

            return {
                Action: oData.Action || "",
                CreatedBy: oData.Ernam || oData.Uname || "",
                Date: oData.Erdat || "",
                Time: oData.Erzet || "",
                Note: oData.Note || "",
                UserName: oData.Uname || oData.Ernam || "",
                FileId: oData.FileId || ""
            };
        },

        _normalizeLinkedObject: function (oRecord) {
            var oData = oRecord || {};

            if (oData.value && typeof oData.value === "object") {
                oData = oData.value;
            }

            return {
                BoId: oData.BoId || oData.BO_ID || oData.BOId || oData.bo_id || "",
                BoType: oData.BoType || oData.BO_TYPE || oData.BOTYPE || oData.Type || "",
                Title: oData.Title || oData.Description || oData.BoType || oData.BoId || "",
                FileId: oData.FileId || ""
            };
        },

        _mergeLinkedObjectData: function (oLinkRecord, oAttachData) {
            var oBizObject = oAttachData && oAttachData.value ? oAttachData.value : (oAttachData || {});

            return {
                BoId: oLinkRecord.BoId,
                BoType: oLinkRecord.BoType || oBizObject.BoType || oBizObject.Type || oBizObject.boType || "",
                Title: oLinkRecord.Title || oBizObject.Title || oBizObject.Description || oBizObject.FileName || "",
                FileId: oLinkRecord.FileId || oBizObject.FileId || ""
            };
        },

        _extractCollection: function (oData) {
            if (Array.isArray(oData)) {
                return oData;
            }

            if (oData && Array.isArray(oData.value)) {
                return oData.value;
            }

            if (oData && oData.d && Array.isArray(oData.d.results)) {
                return oData.d.results;
            }

            return [];
        },

        _fetchCsrfToken: function (sServiceRoot) {
            var sRoot = sServiceRoot || ATTACH_SERVICE_ROOT;

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
            }).then(function (oResponse) {
                var sToken = oResponse.headers.get("x-csrf-token");
                if (!sToken) {
                    throw new Error("Unable to fetch CSRF token");
                }

                this._mCsrfTokens[sRoot] = sToken;
                console.log("✓ CSRF token fetched for service root: " + sRoot);
                return sToken;
            }.bind(this));
        },

        _sendGetRequest: function (sUrl, sServiceRoot) {
            return this._fetchCsrfToken(sServiceRoot).then(function (sToken) {
                console.log("📍 GET URL:", sUrl);

                return fetch(sUrl, {
                    method: "GET",
                    credentials: "include",
                    headers: {
                        "Accept": "application/json",
                        "X-CSRF-Token": sToken
                    }
                });
            }).then(function (oResponse) {
                if (!oResponse.ok) {
                    return oResponse.text().then(function (sText) {
                        throw new Error(sText || ("Request failed with status " + oResponse.status));
                    });
                }

                return oResponse.text().then(function (sText) {
                    return sText ? JSON.parse(sText) : {};
                });
            });
        },

        _sendPostRequest: function (sUrl, oBody) {
            return this._fetchCsrfToken().then(function (sToken) {
                console.log("📍 POST URL:", sUrl);
                console.log("📍 POST BODY:", oBody);

                return fetch(sUrl, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "X-CSRF-Token": sToken
                    },
                    body: JSON.stringify(oBody || {})
                });
            }).then(function (oResponse) {
                if (!oResponse.ok) {
                    return oResponse.text().then(function (sText) {
                        throw new Error(sText || ("Request failed with status " + oResponse.status));
                    });
                }

                var sContentType = (oResponse.headers.get("content-type") || "").toLowerCase();

                if (sContentType.indexOf("application/json") !== -1) {
                    return oResponse.text().then(function (sText) {
                        return sText ? JSON.parse(sText) : {};
                    });
                }

                return oResponse.blob();
            });
        },

        _sendDeleteRequest: function (sUrl, sServiceRoot) {
            return this._fetchCsrfToken(sServiceRoot).then(function (sToken) {
                console.log("📍 DELETE URL:", sUrl);

                return fetch(sUrl, {
                    method: "DELETE",
                    credentials: "include",
                    headers: {
                        "Accept": "application/json",
                        "X-CSRF-Token": sToken
                    }
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

        _triggerDownloadFromResponse: function (oResponseData, sFileName) {
            if (oResponseData instanceof Blob) {
                var sObjectUrl = URL.createObjectURL(oResponseData);
                var oLink = document.createElement("a");

                oLink.href = sObjectUrl;
                oLink.download = sFileName || "attachment";
                document.body.appendChild(oLink);
                oLink.click();
                document.body.removeChild(oLink);
                URL.revokeObjectURL(sObjectUrl);
                return;
            }

            if (oResponseData && oResponseData.FileContent) {
                var sDataUrl = "data:application/octet-stream;base64," + oResponseData.FileContent;
                var oDownloadLink = document.createElement("a");

                oDownloadLink.href = sDataUrl;
                oDownloadLink.download = sFileName || oResponseData.FileName || "attachment";
                document.body.appendChild(oDownloadLink);
                oDownloadLink.click();
                document.body.removeChild(oDownloadLink);
                return;
            }

            MessageToast.show("Download request completed");
        },

        onDownloadAttachment: function () {
            MessageToast.show("Download attachment action");
        },

        onSetCurrent: function () {
            MessageToast.show("Set current version action");
        },

        onDelete: function () {
            var that = this;
            MessageBox.confirm("Are you sure you want to delete this attachment?", {
                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                onClose: function(sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        MessageToast.show("Attachment deleted");
                        that.onNavBack();
                    }
                }
            });
        },

        onDownloadVersion: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext("view");
            var oViewModel = this.getView().getModel("view");
            var sFileId = oViewModel.getProperty("/FileId");
            var sVersionNo = oContext && oContext.getProperty("VersionNo");
            var sFileName = oContext && oContext.getProperty("FileName");

            if (!sFileId) {
                MessageBox.error("Missing FileId for download");
                return;
            }

            if (!sVersionNo) {
                MessageBox.error("Missing VersionNo for download");
                return;
            }

            oViewModel.setProperty("/busy", true);

            this._sendPostRequest(this._getDownloadVersionUrl(sFileId), {
                VERSION_NO: String(sVersionNo)
            }).then(function (oResponseData) {
                this._triggerDownloadFromResponse(oResponseData, sFileName || ("version-" + sVersionNo));
            }.bind(this)).catch(function (oError) {
                MessageBox.error("Failed to download version: " + oError.message);
            }).finally(function () {
                oViewModel.setProperty("/busy", false);
            });
        },

        onAddLink: function () {
            MessageToast.show("Add link action");
        },

        onRemoveLink: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext("view");
            var oLink = oContext && oContext.getObject();
            var oViewModel = this.getView().getModel("view");
            var sBoId = oLink && oLink.BoId;
            var sFileId = oLink && oLink.FileId;

            if (!sBoId || !sFileId) {
                MessageBox.error("Missing BO ID or File ID for unlinking");
                return;
            }

            MessageBox.confirm("Remove link to this business object?", {
                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.OK,
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) {
                        return;
                    }

                    oViewModel.setProperty("/busy", true);

                    this._sendDeleteRequest(this._getUnlinkAttachmentUrl(sBoId, sFileId), BIZ_OBJECT_SERVICE_ROOT)
                        .then(function () {
                            MessageToast.show("Link removed");
                            return this._loadLinkedObjects(this.getView().getModel("view").getProperty("/FileId"));
                        }.bind(this))
                        .catch(function (oError) {
                            MessageBox.error("Failed to remove link: " + oError.message);
                        }.bind(this))
                        .finally(function () {
                            oViewModel.setProperty("/busy", false);
                        });
                }.bind(this)
            });
        },

        onNavBack: function () {
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter.navTo("AttachmentListList");
        }
    });
});
