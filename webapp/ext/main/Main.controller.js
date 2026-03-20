sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/Dialog",
    "sap/m/Input",
    "sap/m/Label",
    "sap/m/Button",
    "sap/m/VBox",
    "zattach/zattachfe/model/formatter"
], function(Controller, JSONModel, Filter, FilterOperator, Dialog, Input, Label, Button, VBox, formatter) {
    "use strict";

    var ATTACH_SERVICE_ROOT = "/sap/opu/odata4/sap/zui_attach_bind/srvd/sap/zui_attach_srv/0001";
    var SAP_CLIENT = "324";

    return Controller.extend("zattach.zattachfe.ext.main.Main", {
        formatter: formatter,
        
        onInit: function() {
            // Initialize view model for UI state
            var oViewModel = new JSONModel({
                viewMode: "list"
            });
            this.getView().setModel(oViewModel, "view");
            this._mCsrfTokens = {};
        },

        onFilterGo: function() {
            var oView = this.getView();
            var aFilters = [];

            // Get filter values
            var sSearch = oView.byId("searchInput").getValue();
            var sVersion = oView.byId("versionInput").getValue();
            var sCreatedBy = oView.byId("createdByInput").getValue();

            // Create filters
            if (sSearch) {
                aFilters.push(new Filter("Title", FilterOperator.Contains, sSearch));
            }
            if (sVersion) {
                aFilters.push(new Filter("CurrentVersion", FilterOperator.Contains, sVersion));
            }
            if (sCreatedBy) {
                aFilters.push(new Filter("Ernam", FilterOperator.Contains, sCreatedBy));
            }

            // Apply filters to table
            var oTable = oView.byId("attachmentTable");
            if (oTable) {
                var oBinding = oTable.getBinding("items");
                if (oBinding) {
                    oBinding.filter(aFilters);
                }
            }
        },

        onViewModeChange: function(oEvent) {
            var sSelectedKey = oEvent.getParameter("item").getKey();
            this.getView().getModel("view").setProperty("/viewMode", sSelectedKey);
        },

        onNewAttachment: function() {
            // Navigate to create attachment view
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            if (oRouter) {
                oRouter.navTo("CreateAttachment");
            }
        },

        onItemPress: function (oEvent) {
    var oItem = oEvent.getSource();
    var sFileId = oItem.getBindingContext().getProperty("FileId");

    this.getOwnerComponent().getRouter().navTo("AttachmentDetail", {
        id: sFileId
    });
},

        onEditAttachment: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var oAttachment = oContext && oContext.getObject();

            if (!oContext || !oAttachment) {
                sap.m.MessageToast.show("Attachment data not found");
                return;
            }

            this._openEditDialog(oContext);
        },

        onDeleteAttachment: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var oAttachment = oContext && oContext.getObject();

            if (!oContext || !oAttachment) {
                sap.m.MessageToast.show("Attachment data not found");
                return;
            }

            this._confirmDeleteAttachment(oAttachment);
        },

        _openEditDialog: function (oContext) {
            var oAttachment = oContext.getObject();

            this._oEditContext = oContext;

            if (!this._oEditTitleInput) {
                this._oEditTitleInput = new Input({
                    width: "100%",
                    maxLength: 255
                });
            }

            this._oEditTitleInput.setValue(oAttachment.Title || "");

            if (!this._oEditDialog) {
                this._oEditDialog = new Dialog({
                    title: "Edit Title",
                    contentWidth: "28rem",
                    content: [
                        new VBox({
                            width: "100%",
                            items: [
                                new Label({
                                    text: "Title"
                                }),
                                this._oEditTitleInput
                            ]
                        })
                    ],
                    beginButton: new Button({
                        text: "Save",
                        type: "Emphasized",
                        press: this._saveEditedTitle.bind(this)
                    }),
                    endButton: new Button({
                        text: "Cancel",
                        press: function () {
                            this._oEditDialog.close();
                        }.bind(this)
                    })
                });

                this.getView().addDependent(this._oEditDialog);
            }

            this._oEditDialog.open();
        },

        _saveEditedTitle: function () {
            var oAttachment = this._oEditContext && this._oEditContext.getObject();
            var sFileId = oAttachment && oAttachment.FileId;
            var sTitle = (this._oEditTitleInput && this._oEditTitleInput.getValue() || "").trim();

            if (!sFileId) {
                sap.m.MessageBox.error("Missing FileId");
                return;
            }

            if (!sTitle) {
                sap.m.MessageBox.error("Title cannot be empty");
                return;
            }

            this._oEditDialog.setBusy(true);

            this._sendApiRequest(
                this._getAttachmentActionUrl(sFileId),
                "PUT",
                {
                    Title: sTitle,
                    EditLock: false
                }
            ).then(function () {
                sap.m.MessageToast.show("Attachment title updated");
                this._oEditDialog.close();
                this._refreshAttachmentList();
            }.bind(this)).catch(function (oError) {
                sap.m.MessageBox.error("Failed to update title: " + oError.message);
            }.bind(this)).finally(function () {
                this._oEditDialog.setBusy(false);
            }.bind(this));
        },

        _confirmDeleteAttachment: function (oAttachment) {
            var sFileId = oAttachment && oAttachment.FileId;
            var sTitle = oAttachment && oAttachment.Title;

            sap.m.MessageBox.confirm("Delete attachment \"" + (sTitle || sFileId || "") + "\"?", {
                actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
                emphasizedAction: sap.m.MessageBox.Action.OK,
                onClose: function (sAction) {
                    if (sAction !== sap.m.MessageBox.Action.OK) {
                        return;
                    }

                    this._sendApiRequest(this._getAttachmentActionUrl(sFileId), "DELETE")
                        .then(function () {
                            sap.m.MessageToast.show("Attachment deleted");
                            this._refreshAttachmentList();
                        }.bind(this))
                        .catch(function (oError) {
                            sap.m.MessageBox.error("Failed to delete attachment: " + oError.message);
                        }.bind(this));
                }.bind(this)
            });
        },

        _refreshAttachmentList: function () {
            var oModel = this.getView().getModel();

            if (oModel && oModel.refresh) {
                oModel.refresh();
            }
        },

        _getAttachmentActionUrl: function (sFileId) {
            return ATTACH_SERVICE_ROOT + "/Attachments(FileId=" + sFileId + ")?sap-client=" + SAP_CLIENT;
        },

        _fetchCsrfToken: function () {
            if (this._mCsrfTokens[ATTACH_SERVICE_ROOT]) {
                return Promise.resolve(this._mCsrfTokens[ATTACH_SERVICE_ROOT]);
            }

            return fetch(ATTACH_SERVICE_ROOT + "/", {
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

                this._mCsrfTokens[ATTACH_SERVICE_ROOT] = sToken;
                return sToken;
            }.bind(this));
        },

        _sendApiRequest: function (sUrl, sMethod, oBody) {
            return this._fetchCsrfToken().then(function (sToken) {
                return fetch(sUrl, {
                    method: sMethod,
                    credentials: "include",
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
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

        onAttachmentPress: function(oEvent) {
            // Navigate to detail page from grid view
            var oBox = oEvent.getSource();
            var oContext = oBox.getBindingContext();
            
            if (oContext) {
                var sFileId = oContext.getProperty("FileId");
                this._navigateToDetail(sFileId);
            }
        },

        _navigateToDetail: function(sFileId) {
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            if (oRouter) {
                // Navigate to custom detail page
                oRouter.navTo("AttachmentDetail", {
                    id: sFileId
                }, false);
            } else {
                sap.m.MessageToast.show("Router not found");
            }
        }
    });
});
