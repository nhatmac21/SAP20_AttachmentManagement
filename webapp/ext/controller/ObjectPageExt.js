sap.ui.define([
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment"
], function(MessageBox, MessageToast, Fragment) {
    "use strict";

    var ObjectPageExt = {
        
        _oUploadDialog: null,
        
        onUploadNewVersion: function(oEvent) {
            console.log("Upload New Version button clicked");
            var oView = this.getView();
            var oContext = oView.getBindingContext();
            
            if (!oContext) {
                MessageBox.error("No attachment selected");
                return;
            }

            console.log("FileId:", oContext.getProperty("FileId"));
            // Load dialog fragment for file upload
            ObjectPageExt._loadUploadDialog.call(this, oContext);
        },

        _loadUploadDialog: function(oContext) {
            var that = this;
            var oView = this.getView();

            if (!ObjectPageExt._oUploadDialog) {
                Fragment.load({
                    name: "zattach.zattachfe.ext.fragment.UploadNewVersion",
                    controller: ObjectPageExt
                }).then(function(oDialog) {
                    ObjectPageExt._oUploadDialog = oDialog;
                    oView.addDependent(oDialog);
                    ObjectPageExt._oUploadDialog.setBindingContext(oContext);
                    ObjectPageExt._oUploadDialog.open();
                }).catch(function(oError) {
                    console.error("Failed to load dialog:", oError);
                    MessageBox.error("Failed to load upload dialog: " + oError.message);
                });
            } else {
                ObjectPageExt._oUploadDialog.setBindingContext(oContext);
                ObjectPageExt._oUploadDialog.open();
            }
        },

        onUploadDialogConfirm: function() {
            var oFileUploader = Fragment.byId("uploadNewVersionDialog", "fileUploader");
            
            if (!oFileUploader) {
                MessageBox.error("File uploader not found");
                return;
            }

            var oFile = oFileUploader.oFileUpload.files[0];

            if (!oFile) {
                MessageBox.error("Please select a file to upload");
                return;
            }

            ObjectPageExt._uploadNewVersion.call(this, oFile);
        },

        onUploadDialogCancel: function() {
            if (ObjectPageExt._oUploadDialog) {
                ObjectPageExt._oUploadDialog.close();
            }
        },

        onRollbackVersion: function(oEvent) {
            var that = this;
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext();
            
            if (!oContext) {
                MessageBox.error("No version selected");
                return;
            }

            var sVersionNo = oContext.getProperty("VersionNo");
            var sFileName = oContext.getProperty("FileName");
            
            MessageBox.confirm(
                "Do you want to rollback to version " + sVersionNo + " of " + sFileName + "?",
                {
                    onClose: function(sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            ObjectPageExt._performRollback.call(that, oContext, sVersionNo);
                        }
                    }
                }
            );
        },

        _performRollback: function(oVersionContext, sVersionNo) {
            var that = this;
            var oModel = this.getView().getModel();
            
            // Get FileId from version context
            var sFileId = oVersionContext.getProperty("FileId");
            
            // Create binding context for the attachment
            var sAttachmentPath = "/Attachments(" + sFileId + ")";
            var oAttachmentBinding = oModel.bindContext(sAttachmentPath);
            
            oAttachmentBinding.requestObject().then(function(oAttachment) {
                // Update CurrentVersion
                var oUpdateContext = oModel.bindContext(sAttachmentPath);
                oUpdateContext.setProperty("CurrentVersion", sVersionNo);
                
                return oModel.submitBatch("updateGroup");
            }).then(function() {
                MessageToast.show("Successfully rolled back to version " + sVersionNo);
                oModel.refresh();
            }).catch(function(oError) {
                var sErrorMsg = "Failed to rollback version";
                if (oError && oError.message) {
                    sErrorMsg += ": " + oError.message;
                }
                MessageBox.error(sErrorMsg);
            });
        },

        _uploadNewVersion: function(oFile) {
            var that = this;
            var oContext = ObjectPageExt._oUploadDialog.getBindingContext();
            var sFileId = oContext.getProperty("FileId");
            var oModel = this.getView().getModel();

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
                ObjectPageExt._createVersionViaRBA.call(that, oModel, sFileId, {
                    FileName: sFileName,
                    FileExtension: sFileExtension,
                    MimeType: sMimeType,
                    FileSize: iFileSize,
                    FileContent: base64Content
                });
            };
            reader.readAsBinaryString(oFile);
        },

        _createVersionViaRBA: function(oModel, sFileId, oVersionData) {
            var that = this;
            // Ensure FileId is properly formatted
            var sPath = "/Attachments(" + sFileId + ")/_Versions";

            // Create new version via navigation
            var oListBinding = oModel.bindList(sPath);
            
            var oNewContext = oListBinding.create({
                FileName: oVersionData.FileName,
                FileExtension: oVersionData.FileExtension,
                MimeType: oVersionData.MimeType,
                FileSize: oVersionData.FileSize,
                FileContent: oVersionData.FileContent
            });

            oNewContext.created().then(function() {
                MessageToast.show("New version uploaded successfully");
                ObjectPageExt._oUploadDialog.close();
                
                // Refresh the model to reload versions
                oModel.refresh();
            }).catch(function(oError) {
                var sErrorMsg = "Failed to upload new version";
                if (oError && oError.message) {
                    sErrorMsg += ": " + oError.message;
                }
                MessageBox.error(sErrorMsg);
            });
        },

        _createVersionViaAction: function(oModel, sFileId, oVersionData) {
            var that = this;
            var sActionPath = "/Attachments(" + sFileId + ")/com.sap.gateway.srvd.zui_attach_srv.v0001.upload_new_version";

            // Call OData action
            var oAction = oModel.bindContext(sActionPath);
            oAction.setParameter("FILE_NAME", oVersionData.FileName);
            oAction.setParameter("FILE_EXTENSION", oVersionData.FileExtension);
            oAction.setParameter("MIME_TYPE", oVersionData.MimeType);
            oAction.setParameter("FILE_SIZE", oVersionData.FileSize);
            oAction.setParameter("FILE_CONTENT", oVersionData.FileContent);

            oAction.execute().then(function() {
                MessageToast.show("New version uploaded successfully");
                ObjectPageExt._oUploadDialog.close();
                
                // Refresh the versions table
                that.getView().getModel().refresh();
            }).catch(function(oError) {
                MessageBox.error("Failed to upload new version: " + oError.message);
            });
        }
    };
    
    return ObjectPageExt;
});
