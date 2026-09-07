# YakiStock

YakiStock is a progressive web application (PWA) for inventory management, stock movements, and sales tracking.

The current version runs entirely in the browser, without a backend or server database. Data is stored locally on the device using `localStorage`.

## Features

- Local account creation and login
- Role-based access:
  - General administrator
  - Stock manager
  - Sales operator
- Inventory dashboard
- Product creation, editing, and deletion
- Product search by name or category
- Card and table views for stock
- Minimum and maximum stock thresholds
- Low and critical stock alerts
- Stock inbound and outbound movement tracking
- Movement history
- Local estimation of days before stock depletion
- Restocking recommendations
- Sales space creation
- Sales operator assignment
- Shopping cart and order validation
- Order journal and sales metrics
- User profile editing
- Display and alert settings
- Local stock assistant
- Offline functionality after assets are cached
- Installable as an application through PWA support

## Technologies

- HTML5
- CSS3
- Client-side JavaScript
- Web Storage API (`localStorage`)
- Service Worker
- Web App Manifest
- No mandatory npm dependencies
- No backend included
- No SQL database included

## Project Structure

```text
YAKISTOCK/
├── app.js                 # Application logic
├── index.html             # User interface
├── style.css              # Styles and responsive design
├── manifest.json          # PWA configuration
├── sw.js                  # Cache and offline support
├── README.md              # Project documentation
└── icons/                 # Application logos and images
```

## Installation

No dependency installation is required.

1. Open the project folder in VS Code.
2. Open `index.html` in a browser, or use a local server extension.
3. Create an account from the registration screen.
4. Add products and configure stock thresholds.

For the Service Worker and PWA installation to work correctly, using a local server is recommended instead of opening the file directly with `file://`.

## Running with VS Code

Using the **Live Server** extension:

1. Open `index.html`.
2. Click **Go Live**.
3. Open the local address displayed by VS Code.

Alternatively, use any static server available on the machine, for example:

```powershell
py -m http.server 5500
```

Then open:

```text
http://127.0.0.1:5500
```

## Usage

### First Account

The first account created automatically receives the general administrator role.

Later accounts are created with the stock manager role by default. The administrator can create or edit users and assign their roles.

### General Administrator

The administrator can:

- Create and edit users
- Assign roles
- Create sales spaces
- Assign operators to sales spaces
- View financial metrics
- View the order journal
- Manage the product catalog and stock movements

### Stock Manager

The stock manager can:

- Add and edit products
- Monitor stock levels
- Record inbound and outbound movements
- View movement history
- View stock predictions
- View the order journal

### Sales Operator

The sales operator can:

- Open the assigned sales space
- Add products to the cart
- Validate orders
- View the number of sales made during the day

## Data Storage

Data is stored locally in the browser. The main storage keys are:

- `yakistock_state_v1`: products and stock movements
- `yakistock_users_v1`: user accounts
- `yakistock_session_v1`: active session
- `yakistock_registers_v1`: sales spaces
- `yakistock_sales_v1`: orders and sales
- `yakistock_settings_v1`: display and alert preferences

Data belongs to the browser and device being used. It is not automatically shared between devices.

## Current Limitations

- No backend is included in this version.
- No SQL database is used.
- Passwords are stored locally and must not be considered secure for production use.
- Data may be lost if browser storage is cleared.
- Cross-device synchronization is not available yet.
- Access controls are enforced only in the user interface.
- Predictions are local estimates based on stock movement history.
- The assistant is local and does not use a remote NLP model.

## Future Backend Preparation

A future backend may provide:

- Secure authentication
- Centralized user and product storage
- Company and sales space management
- Multi-device synchronization
- Server-side permission checks
- Backups
- Reliable operation history
- A more advanced prediction model
- An assistant connected to an NLP service

This part will be designed and added separately.

## PWA and Offline Support

The `manifest.json` file defines the application installation settings. The `sw.js` file caches the main resources:

- `index.html`
- `style.css`
- `app.js`
- `manifest.json`
- Application images and icons

After the resources have been loaded, the interface can continue working offline. Data remains stored in the browser.

## Resetting Local Data

To start over, open the browser console and run:

```javascript
localStorage.clear();
location.reload();
```

This removes the accounts, active session, products, movements, sales, and settings stored on the device.

## Security

This version is intended for demonstration or local use. It should not be used as-is for sensitive data or production multi-user deployments.

Before production use, the application will need server-side authentication, secure password storage, server-side validation, permission management, and backups.

## License

<<<<<<< HEAD
Licence MIT
=======
No specific license has been defined yet.
>>>>>>> 3243e19 (feat: initial commit - YakiStock core setup and SQL schema)
