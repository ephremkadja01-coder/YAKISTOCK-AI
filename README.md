# YakiStock

YakiStock is a progressive web application (PWA) for inventory management, stock movements, and sales tracking.

The frontend runs locally in the browser and is connected to the FastAPI backend for registration, login, JWT authentication, and product CRUD. MySQL stores users and products; the remaining tables are ready for inventory, sales, and movement features.

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
- FastAPI
- MySQL
- No mandatory npm dependencies

## Project Structure

```text
YAKISTOCK/
├── app.js                 # Application logic
├── index.html             # User interface
├── style.css              # Styles and responsive design
├── manifest.json          # PWA configuration
├── sw.js                  # Cache and offline support
├── main.py                # FastAPI backend
├── schema.sql             # MySQL database schema
├── requirements.txt       # Python dependencies
├── .env.example           # Database and JWT configuration template
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

## Running the Frontend with VS Code

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

## Setting Up MySQL

Install MySQL Server, then create the database and all tables by running `schema.sql` in MySQL Workbench or the MySQL client:

```sql
SOURCE schema.sql;
```

Copy `.env.example` to `.env` and set the MySQL password and a long random JWT secret:

```text
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=yakistock_db
JWT_SECRET_KEY=replace_with_a_long_random_secret
JWT_EXPIRE_MINUTES=60
CORS_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
```

Install the backend dependencies:

```powershell
py -m pip install -r requirements.txt
```

Start the API from the project folder:

```powershell
py -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API requires the dependencies listed in `requirements.txt`, including JWT and password hashing packages.

### Authentication Endpoints

Register a user:

```http
POST /register
Content-Type: application/json

{
  "email": "owner@example.com",
  "password": "a-strong-password"
}
```

Log in and receive a JWT:

```http
POST /login
Content-Type: application/json

{
  "email": "owner@example.com",
  "password": "a-strong-password"
}
```

Use the returned token for protected requests:

```http
Authorization: Bearer <access_token>
```

### Product Endpoints

The current product endpoints are:

- `GET /products`
- `POST /products`
- `PUT /products/{product_id}`
- `DELETE /products/{product_id}`
- `GET /movements`
- `POST /movements`
- `GET /sales-spaces`
- `POST /sales-spaces`
- `DELETE /sales-spaces/{space_id}`
- `GET /users`
- `PATCH /users/{user_id}`
- `GET /sales`
- `POST /sales`
- `POST /chat`
- `GET /ml/dataset`

Every product is associated with its creator through `user_id`. Authenticated users can only list, update, or delete their own products.

The chatbot uses the authenticated user's products and stores each question and answer in `chat_messages`. Stock movements and sales automatically create training observations in `ml_observations`. The `/ml/dataset` endpoint exports these observations for a future demand-prediction model; no ML model is trained automatically yet.

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

The frontend currently stores its local state in the browser. The main storage keys are:

- `yakistock_state_v1`: products and stock movements
- `yakistock_users_v1`: user accounts
- `yakistock_session_v1`: active session
- `yakistock_registers_v1`: sales spaces
- `yakistock_sales_v1`: orders and sales
- `yakistock_settings_v1`: display and alert preferences

Data belongs to the browser and device being used. It is not automatically shared between devices.

The MySQL schema in `schema.sql` provides these relational tables:

- `users`
- `sales_spaces`
- `products`
- `stock_movements`
- `sales`
- `sale_items`
- `user_settings`

The `users` table stores `id`, `email`, `password_hash`, role information, and timestamps. The `products` table includes `id`, `user_id`, `name`, `description`, `price`, `quantity`, and `created_at`, along with the existing stock-management fields.

## Current Limitations

- The frontend is currently connected to authentication and product CRUD.
- Movements and the chatbot are connected to the API.
- Sales spaces, user administration, and sales checkout still need their final frontend wiring.
- Passwords are stored locally and must not be considered secure for production use.
- Data may be lost if browser storage is cleared.
- Cross-device synchronization is not available yet.
- Access controls are enforced only in the user interface.
- Predictions are local estimates based on stock movement history.
- The assistant is local and does not use a remote NLP model.

## Future Backend Work

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

Licence MIT
