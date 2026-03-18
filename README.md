# SAP Fiori Application - Attachment Management

SAP Fiori Elements application for managing attachments using Flexible Programming Model (FPM).

## Backend Configuration

- **Service URL**: https://s40lp1.ucc.cit.tum.de/sap/opu/odata4/sap/zui_attach_bind/srvd/sap/zui_attach_srv/0001/
- **SAP Client**: 324
- **OData Version**: 4.0

## Prerequisites

- Node.js (version 18 or higher)
- npm (version 8 or higher)
- @sap/generator-fiori installed globally

## Installation

```bash
npm install
```

## Running Locally

### ✅ With Authentication (Recommended)
Sử dụng file ui5-local.yaml đã được cấu hình với credentials:
```bash
npm run start-local
```

### With FLP Sandbox
```bash
npm start
```

### Without FLP Sandbox
```bash
npm run start-noflp
```

## Building

```bash
npm run build
```

## Project Structure

```
SAP_CAPSTONE/
├── webapp/
│   ├── annotations/         # OData annotations
│   ├── ext/                # Custom extensions
│   ├── i18n/               # Internationalization files
│   ├── localService/       # Local mock data and metadata
│   ├── test/               # Test files
│   ├── Component.js        # Component definition
│   ├── index.html          # Application entry point
│   └── manifest.json       # Application descriptor
├── package.json
├── ui5.yaml               # UI5 tooling configuration
└── xs-app.json           # Application router configuration
```

## Features

- Flexible Programming Model (FPM)
- OData V4 support
- Custom view extensions
- Mock server for local development
- Proxy configuration to SAP backend

## Development Notes

- The application uses SAP Fiori Elements with custom page extensions
- Backend proxy is configured in ui5.yaml for development
- Mock data can be generated automatically or manually added to localService/mainService/data/

## ✅ Authentication & Metadata Status

1. **Metadata**: ✅ Successfully fetched from SAP backend
   - File: [webapp/localService/mainService/metadata.xml](webapp/localService/mainService/metadata.xml)
   - Contains 3 main entities: AttachmentList, Attachments, AttachmentVersions
   - Full UI annotations included

2. **Authentication**: ✅ Configured in ui5-local.yaml
   - Username: dev-083
   - Backend: https://s40lp1.ucc.cit.tum.de
   - Client: 324
   - Use `npm run start-local` to run with authentication

3. **Security**: 
   - ui5-local.yaml is added to .gitignore (contains credentials)
   - Never commit credentials to version control

## Troubleshooting

- If you get authentication errors, verify credentials in ui5-local.yaml
- For CORS issues, ensure the backend proxy is properly configured
- Check browser console for detailed error messages
