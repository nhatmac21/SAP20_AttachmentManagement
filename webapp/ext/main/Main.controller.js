sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "zattach/zattachfe/model/formatter"
], function(Controller, JSONModel, Filter, FilterOperator, formatter) {
    "use strict";

    return Controller.extend("zattach.zattachfe.ext.main.Main", {
        formatter: formatter,
        
        onInit: function() {
            // Initialize view model for UI state
            var oViewModel = new JSONModel({
                viewMode: "list" // Default view mode
            });
            this.getView().setModel(oViewModel, "view");
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

        onItemPress: function(oEvent) {
            // Handle row press in table
            var oItem = oEvent.getParameter("listItem") || oEvent.getSource();
            var oContext = oItem.getBindingContext();
            
            if (oContext) {
                var sFileId = oContext.getProperty("FileId");
                this._navigateToDetail(sFileId);
            }
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
                // Navigate to the selected Attachments object page
                oRouter.navTo("AttachmentListObjectPage", {
                    key: sFileId
                }, false);
            } else {
                sap.m.MessageToast.show("Router not found");
            }
        }
    });
});
