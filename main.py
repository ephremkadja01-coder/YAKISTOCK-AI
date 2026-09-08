import os
from datetime import date, datetime, timedelta, timezone

import mysql.connector
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from pwdlib import PasswordHash

load_dotenv()

app = FastAPI(title="YakiStock API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://127.0.0.1:5500,http://localhost:5500").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
security = HTTPBearer()
password_hash = PasswordHash.recommended()
JWT_ALGORITHM = "HS256"


class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: str
    password: str


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    category: str = Field(default="General", max_length=120)
    price: float = Field(ge=0)
    quantity: int = Field(default=0, ge=0)


class MovementCreate(BaseModel):
    product_id: int
    movement_type: str = Field(pattern="^(in|out)$")
    quantity: int = Field(gt=0)
    movement_date: date | None = None
    note: str | None = Field(default=None, max_length=255)


class SalesSpaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = Field(default=None, min_length=3, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: str | None = Field(default=None, pattern="^(admin|manager|cashier)$")
    sales_space_id: int | None = None


class SaleItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)


class SaleCreate(BaseModel):
    sales_space_id: int
    items: list[SaleItemCreate] = Field(min_length=1)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)


def get_db_connection():
    try:
        return mysql.connector.connect(
            host=os.getenv("MYSQL_HOST", "localhost"),
            port=int(os.getenv("MYSQL_PORT", "3306")),
            user=os.getenv("MYSQL_USER", "root"),
            password=os.getenv("MYSQL_PASSWORD", ""),
            database=os.getenv("MYSQL_DATABASE", "yakistock_db"),
        )
    except mysql.connector.Error:
        return None


def create_access_token(user_id: int, email: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(
        minutes=int(os.getenv("JWT_EXPIRE_MINUTES", "60"))
    )
    payload = {"sub": str(user_id), "email": email, "exp": expires}
    return jwt.encode(payload, os.getenv("JWT_SECRET_KEY", "change-me"), algorithm=JWT_ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(
            credentials.credentials,
            os.getenv("JWT_SECRET_KEY", "change-me"),
            algorithms=[JWT_ALGORITHM],
        )
        user_id = int(payload["sub"])
    except (JWTError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Jeton invalide")

    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, email, role, sales_space_id FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
    finally:
        cursor.close()
        db.close()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable")
    return user


def require_roles(*roles):
    def dependency(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès interdit")
        return current_user

    return dependency


@app.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@app.post("/register", status_code=status.HTTP_201_CREATED)
def register(user: UserRegister):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE email = %s", (user.email.lower(),))
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Cette adresse e-mail existe déjà")
        cursor.execute("SELECT COUNT(*) FROM users")
        role = "admin" if cursor.fetchone()[0] == 0 else "manager"
        cursor.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (%s, %s, %s, %s)",
            (user.name, user.email.lower(), password_hash.hash(user.password), role),
        )
        db.commit()
        user_id = cursor.lastrowid
    finally:
        cursor.close()
        db.close()
    return {"message": "Utilisateur créé", "access_token": create_access_token(user_id, user.email.lower()), "token_type": "bearer", "user": {"id": user_id, "name": user.name, "email": user.email.lower(), "role": role}}


@app.post("/login")
def login(user: UserLogin):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, name, email, role, password_hash FROM users WHERE email = %s", (user.email.lower(),))
        stored_user = cursor.fetchone()
    finally:
        cursor.close()
        db.close()
    if not stored_user or not password_hash.verify(user.password, stored_user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants invalides")
    return {"access_token": create_access_token(stored_user["id"], stored_user["email"]), "token_type": "bearer", "user": {"id": stored_user["id"], "name": stored_user["name"], "email": stored_user["email"], "role": stored_user["role"]}}


@app.get("/products")
def get_products(current_user: dict = Depends(get_current_user)):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, user_id, name, description, category, price, quantity, created_at "
            "FROM products WHERE user_id = %s ORDER BY created_at DESC",
            (current_user["id"],),
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        db.close()


@app.post("/products", status_code=status.HTTP_201_CREATED)
def create_product(product: ProductCreate, current_user: dict = Depends(get_current_user)):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor()
    try:
        cursor.execute(
            "INSERT INTO products (user_id, name, description, category, price, quantity) VALUES (%s, %s, %s, %s, %s, %s)",
            (current_user["id"], product.name, product.description, product.category, product.price, product.quantity),
        )
        db.commit()
        return {"message": "Produit créé avec succès", "id": cursor.lastrowid}
    finally:
        cursor.close()
        db.close()


@app.put("/products/{product_id}")
def update_product(product_id: int, product: ProductCreate, current_user: dict = Depends(get_current_user)):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor()
    try:
        cursor.execute(
            "UPDATE products SET name = %s, description = %s, category = %s, price = %s, quantity = %s "
            "WHERE id = %s AND user_id = %s",
            (product.name, product.description, product.category, product.price, product.quantity, product_id, current_user["id"]),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Produit non trouvé")
        db.commit()
        return {"message": f"Produit {product_id} mis à jour avec succès"}
    finally:
        cursor.close()
        db.close()


@app.delete("/products/{product_id}")
def delete_product(product_id: int, current_user: dict = Depends(get_current_user)):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor()
    try:
        cursor.execute("DELETE FROM products WHERE id = %s AND user_id = %s", (product_id, current_user["id"]))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Produit non trouvé")
        db.commit()
        return {"message": f"Produit {product_id} supprimé avec succès"}
    finally:
        cursor.close()
        db.close()


@app.get("/health")
def health():
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=503, detail="Base de données indisponible")
    db.close()
    return {"status": "ok"}


@app.get("/movements")
def get_movements(current_user: dict = Depends(get_current_user)):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT m.id, m.product_id, m.movement_type, m.quantity, m.movement_date, m.note "
            "FROM stock_movements m JOIN products p ON p.id = m.product_id "
            "WHERE p.user_id = %s ORDER BY m.movement_date DESC, m.id DESC",
            (current_user["id"],),
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        db.close()


@app.post("/movements", status_code=status.HTTP_201_CREATED)
def create_movement(movement: MovementCreate, current_user: dict = Depends(get_current_user)):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT quantity FROM products WHERE id = %s AND user_id = %s FOR UPDATE",
            (movement.product_id, current_user["id"]),
        )
        product = cursor.fetchone()
        if not product:
            raise HTTPException(status_code=404, detail="Produit non trouvé")
        new_quantity = product["quantity"] + movement.quantity if movement.movement_type == "in" else product["quantity"] - movement.quantity
        if new_quantity < 0:
            raise HTTPException(status_code=409, detail="Stock insuffisant")
        cursor.execute("UPDATE products SET quantity = %s WHERE id = %s", (new_quantity, movement.product_id))
        cursor.execute(
            "INSERT INTO stock_movements (product_id, user_id, movement_type, quantity, movement_date, note) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (movement.product_id, current_user["id"], movement.movement_type, movement.quantity, movement.movement_date or date.today(), movement.note),
        )
        cursor.execute(
            "INSERT INTO ml_observations (user_id, product_id, event_type, quantity, stock_after) VALUES (%s, %s, %s, %s, %s)",
            (current_user["id"], movement.product_id, "stock_in" if movement.movement_type == "in" else "stock_out", movement.quantity, new_quantity),
        )
        db.commit()
        return {"id": cursor.lastrowid, "quantity": new_quantity}
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()
        db.close()


@app.get("/sales-spaces")
def get_sales_spaces(current_user: dict = Depends(require_roles("admin", "manager", "cashier"))):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, name, is_active, created_at FROM sales_spaces WHERE is_active = TRUE ORDER BY name")
        return cursor.fetchall()
    finally:
        cursor.close()
        db.close()


@app.post("/sales-spaces", status_code=status.HTTP_201_CREATED)
def create_sales_space(space: SalesSpaceCreate, current_user: dict = Depends(require_roles("admin"))):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor()
    try:
        cursor.execute("INSERT INTO sales_spaces (name) VALUES (%s)", (space.name,))
        db.commit()
        return {"id": cursor.lastrowid, "name": space.name, "is_active": True}
    except mysql.connector.IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cet espace existe déjà")
    finally:
        cursor.close()
        db.close()


@app.delete("/sales-spaces/{space_id}")
def delete_sales_space(space_id: int, current_user: dict = Depends(require_roles("admin"))):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor()
    try:
        cursor.execute("UPDATE sales_spaces SET is_active = FALSE WHERE id = %s", (space_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Espace non trouvé")
        db.commit()
        return {"message": "Espace désactivé"}
    finally:
        cursor.close()
        db.close()


@app.get("/users")
def get_users(current_user: dict = Depends(require_roles("admin", "manager"))):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT u.id, u.name, u.email, u.role, u.sales_space_id, s.name AS sales_space_name "
            "FROM users u LEFT JOIN sales_spaces s ON s.id = u.sales_space_id ORDER BY u.name"
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        db.close()


@app.patch("/users/{user_id}")
def update_user(user_id: int, update: UserUpdate, current_user: dict = Depends(require_roles("admin"))):
    if update.role == "admin" and user_id != current_user["id"]:
        raise HTTPException(status_code=400, detail="Impossible de créer un autre administrateur")
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor()
    try:
        fields = []
        params = []
        if update.name is not None:
            fields.append("name = %s")
            params.append(update.name)
        if update.email is not None:
            fields.append("email = %s")
            params.append(update.email.lower())
        if update.password is not None:
            fields.append("password_hash = %s")
            params.append(password_hash.hash(update.password))
        if update.role is not None:
            fields.append("role = %s")
            params.append(update.role)
        if "sales_space_id" in update.model_fields_set:
            fields.append("sales_space_id = %s")
            params.append(update.sales_space_id)
        if not fields:
            raise HTTPException(status_code=400, detail="Aucune modification fournie")
        cursor.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = %s", (*params, user_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        db.commit()
        return {"message": "Utilisateur mis à jour"}
    finally:
        cursor.close()
        db.close()


@app.delete("/users/{user_id}")
def delete_user(user_id: int, current_user: dict = Depends(require_roles("admin"))):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor()
    try:
        cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        db.commit()
        return {"message": "Utilisateur supprimé"}
    finally:
        cursor.close()
        db.close()


@app.get("/sales")
def get_sales(current_user: dict = Depends(require_roles("admin", "manager", "cashier"))):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor(dictionary=True)
    try:
        query = (
            "SELECT s.id, s.sales_space_id, s.cashier_id, s.sale_date, s.total_amount, "
            "sp.name AS sales_space_name, u.name AS cashier_name "
            "FROM sales s JOIN sales_spaces sp ON sp.id = s.sales_space_id "
            "JOIN users u ON u.id = s.cashier_id "
        )
        if current_user["role"] == "cashier":
            query += "WHERE s.cashier_id = %s "
            params = (current_user["id"],)
        else:
            params = ()
        cursor.execute(query + "ORDER BY s.created_at DESC", params)
        return cursor.fetchall()
    finally:
        cursor.close()
        db.close()


@app.post("/sales", status_code=status.HTTP_201_CREATED)
def create_sale(sale: SaleCreate, current_user: dict = Depends(require_roles("admin", "manager", "cashier"))):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id FROM sales_spaces WHERE id = %s AND is_active = TRUE",
            (sale.sales_space_id,),
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Espace de vente non trouvé")
        if current_user["role"] == "cashier" and current_user.get("sales_space_id") != sale.sales_space_id:
            raise HTTPException(status_code=403, detail="Cet espace ne vous est pas affecté")
        total = 0
        product_rows = []
        for item in sale.items:
            cursor.execute("SELECT id, price, purchase_price, quantity FROM products WHERE id = %s FOR UPDATE", (item.product_id,))
            product = cursor.fetchone()
            if not product:
                raise HTTPException(status_code=404, detail=f"Produit {item.product_id} non trouvé")
            if product["quantity"] < item.quantity:
                raise HTTPException(status_code=409, detail=f"Stock insuffisant pour le produit {item.product_id}")
            total += float(product["price"]) * item.quantity
            product_rows.append((item, product))
        cursor.execute(
            "INSERT INTO sales (sales_space_id, cashier_id, sale_date, total_amount) VALUES (%s, %s, %s, %s)",
            (sale.sales_space_id, current_user["id"], date.today(), total),
        )
        sale_id = cursor.lastrowid
        for item, product in product_rows:
            cursor.execute(
                "INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, purchase_price) VALUES (%s, %s, %s, %s, %s)",
                (sale_id, item.product_id, item.quantity, product["price"], product["purchase_price"]),
            )
            cursor.execute("UPDATE products SET quantity = quantity - %s WHERE id = %s", (item.quantity, item.product_id))
            cursor.execute(
                "INSERT INTO stock_movements (product_id, user_id, movement_type, quantity, movement_date, note) VALUES (%s, %s, 'out', %s, %s, %s)",
                (item.product_id, current_user["id"], item.quantity, date.today(), f"Sale #{sale_id}"),
            )
            cursor.execute(
                "INSERT INTO ml_observations (user_id, product_id, event_type, quantity, stock_after) "
                "SELECT %s, id, 'sale', %s, quantity FROM products WHERE id = %s",
                (current_user["id"], item.quantity, item.product_id),
            )
        db.commit()
        return {"id": sale_id, "total_amount": total}
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()
        db.close()


@app.post("/chat")
def chat(request: ChatRequest, current_user: dict = Depends(get_current_user)):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT name, quantity, minimum_quantity, unit FROM products WHERE user_id = %s",
            (current_user["id"],),
        )
        products = cursor.fetchall()
        question = request.message.lower()
        alerts = [p for p in products if p["quantity"] <= p["minimum_quantity"]]
        if "rupture" in question or "alerte" in question:
            reply = "Aucune référence n'est sous le seuil minimum." if not alerts else f"{len(alerts)} référence(s) sont sous le seuil : {', '.join(p['name'] for p in alerts[:5])}."
        elif "valeur" in question or "total" in question:
            cursor.execute("SELECT COALESCE(SUM(quantity * price), 0) AS total FROM products WHERE user_id = %s", (current_user["id"],))
            reply = f"La valeur globale du stock est de {float(cursor.fetchone()['total']):,.0f} FCFA."
        else:
            matched = next((p for p in products if p["name"].lower() in question), None)
            reply = f"{matched['name']} : {matched['quantity']} {matched['unit']} en stock." if matched else "Je peux vous renseigner sur les alertes, la valeur du stock ou un produit précis."
        cursor.execute("INSERT INTO chat_messages (user_id, message, reply) VALUES (%s, %s, %s)", (current_user["id"], request.message, reply))
        db.commit()
        return {"reply": reply}
    finally:
        cursor.close()
        db.close()


@app.get("/ml/dataset")
def get_ml_dataset(current_user: dict = Depends(require_roles("admin", "manager"))):
    db = get_db_connection()
    if not db:
        raise HTTPException(status_code=500, detail="Erreur BDD")
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT o.product_id, o.event_type, o.quantity, o.stock_after, o.observed_at "
            "FROM ml_observations o WHERE o.user_id = %s ORDER BY o.observed_at ASC",
            (current_user["id"],),
        )
        return {"data": cursor.fetchall(), "count": cursor.rowcount}
    finally:
        cursor.close()
        db.close()