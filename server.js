// --- Imports ---
import express from "express";
import session from "express-session";
import bodyParser from "body-parser";
import sqlite3 from "sqlite3";
import multer from "multer";
import path from "path";
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";
import { fileURLToPath } from "url";

// Fix dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "public/uploads"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });


// --- App setup ---
const app = express();
const PORT = 3000;

// --- Middleware ---
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: "supersecretkey",
    resave: false,
    saveUninitialized: true,
  })
);
app.use(express.static(path.join(__dirname, "public")));

// --- Database setup ---
const db = new sqlite3.Database("kaffyseni.db", (err) => {
  if (err) console.error("Error opening DB:", err.message);
  else console.log("✅ Connected to SQLite DB");
});



// === CREATE ORDERS TABLE IF NOT EXISTS ===
db.run(`CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT,
  items TEXT,
  total INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);



// --- Create products table if it doesn’t exist ---
db.run(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    image TEXT,
    category TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error("Error creating products table:", err);
  } else {
    console.log("✅ Products table ready.");


    // ✅ Ensure products table exists
db.run(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT,
    image TEXT
  )
`);





    // --- Insert demo products if table is empty ---
    db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
      if (err) {
        console.error("Error checking products:", err);
        return;
      }

      if (row.count === 0) {
        const demoProducts = [
          ["Ankara Maxi Dress", "Beautiful African print dress perfect for any occasion.", 15000, "/images/ankara.jpg", "Fashion"],
          ["Leather Handbag", "Stylish brown leather handbag for everyday use.", 12500, "/images/bag.jpg", "Accessories"],
          ["Men's Designer Shoes", "Elegant shoes for formal or semi-casual outfits.", 20000, "/images/shoes.jpg", "Footwear"],
          ["Casual T-Shirt", "Simple cotton T-shirt available in multiple colors.", 5500, "/images/tshirt.jpg", "Fashion"],
          ["Beaded Necklace", "Handcrafted traditional necklace with vibrant colors.", 4000, "/images/necklace.jpg", "Jewelry"],
          ["Denim Jeans", "Classic blue jeans with premium stitching.", 10000, "/images/jeans.jpg", "Fashion"]
        ];

        const insertQuery = `INSERT INTO products (name, description, price, image, category) VALUES (?, ?, ?, ?, ?)`;

        demoProducts.forEach(product => {
          db.run(insertQuery, product, (err) => {
            if (err) console.error("Error inserting product:", err);
          });
        });

        console.log("✅ Demo products inserted successfully!");
      } else {
        console.log(`🛍️ ${row.count} products already exist — skipping demo insert.`);
      }
    });
  }
});





// --- Create master admin account ---
const adminEmail = "admin@kaffyseni.com";
const adminPass = "Admin@123";

db.get("SELECT * FROM users WHERE email = ?", [adminEmail], async (err, user) => {
  if (!user) {
    const hashed = await bcrypt.hash(adminPass, 10);
    db.run(
      "INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, ?)",
      ["Master Admin", adminEmail, hashed, 1]
    );
    console.log("👑 Master admin created:", adminEmail, "password:", adminPass);
  }
});

// --- Create reports table if not exists ---
db.run(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )
`);

// --- Create Orders Table ---
db.run(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT,
    items TEXT,
    total_price REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create orders table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT,
    customer_email TEXT,
    items TEXT,
    total REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);




// --- Nodemailer setup (use your Gmail or SMTP) ---
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "your_email@gmail.com",
    pass: "your_app_password", // Use an App Password for Gmail
  },
});

// --- Routes ---

// Root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Signup
app.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).send("Missing fields");

  const hashedPassword = await bcrypt.hash(password, 10);
  const sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";
  db.run(sql, [name, email, hashedPassword], (err) => {
    if (err) return res.status(400).send("User already exists");
    res.send("Signup successful!");
  });
});

// login

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) return res.status(500).send("Database error");
    if (!user) return res.send("User not found");

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send("Invalid password");

    req.session.user = user;

    // ✅ Redirect based on role
    if (user.is_admin) {
      res.redirect("/admin");
    } else {
      res.redirect("/dashboard");
    }
  });
});

// Request password reset
app.post("/forgot-password", (req, res) => {
  const { email } = req.body;
  const token = crypto.randomBytes(20).toString("hex");
  const expiry = Date.now() + 3600000; // 1 hour

  db.run(
    "UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?",
    [token, expiry, email],
    (err) => {
      if (err) return res.status(500).send("Database error");
      const resetLink = `http://localhost:${PORT}/reset-password/${token}`;
      transporter.sendMail(
        {
          to: email,
          subject: "Password Reset",
          text: `Click here to reset your password: ${resetLink}`,
        },
        (mailErr) => {
          if (mailErr) return res.status(500).send("Error sending email");
          res.send("Password reset link sent to your email");
        }
      );
    }
  );
});

// Reset password page
app.get("/reset-password/:token", (req, res) => {
  const token = req.params.token;
  res.send(`
    <form action="/reset-password/${token}" method="POST">
      <input type="password" name="newPassword" placeholder="New Password" required />
      <button type="submit">Reset Password</button>
    </form>
  `);
});

// Handle password reset
app.post("/reset-password/:token", async (req, res) => {
  const { newPassword } = req.body;
  const token = req.params.token;
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  const now = Date.now();

  db.get(
    "SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > ?",
    [token, now],
    (err, user) => {
      if (err || !user) return res.status(400).send("Invalid or expired token");

      db.run(
        "UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?",
        [hashedPassword, user.id],
        (updateErr) => {
          if (updateErr) return res.status(500).send("Error updating password");
          res.send("Password reset successful!");
        }
      );
    }
  );
});

// product routes
app.get("/products", (req, res) => {
  db.all("SELECT * FROM products", (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to fetch products" });
    res.json(rows);
  });
});

// --- Fetch all products for shop page ---
app.get("/api/products", (req, res) => {
  db.all("SELECT * FROM products", [], (err, rows) => {
    if (err) {
      console.error("Error fetching products:", err);
      return res.status(500).send("Error fetching products");
    }
    res.json(rows);
  });
});

// --- DELETE Product (Admin Only) ---
app.delete("/api/admin/products/:id", requireLogin, (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send("Forbidden");

  const productId = req.params.id;

  db.run("DELETE FROM products WHERE id = ?", [productId], function (err) {
    if (err) return res.status(500).json({ error: "Failed to delete product" });
    if (this.changes === 0) return res.status(404).json({ error: "Product not found" });

    res.json({ success: true, message: "Product deleted successfully" });
  });
});



// --- Dashboard & Reports Routes ---

// Middleware to protect routes
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).send("Unauthorized");
  next();
}

// Get reports for logged-in user
app.get("/api/reports", requireLogin, (req, res) => {
  db.all("SELECT * FROM reports WHERE user_id = ?", [req.session.user.id], (err, rows) => {
    if (err) return res.status(500).send("Error fetching reports");
    res.json(rows);
  });
});

// Create new report
app.post("/api/reports", requireLogin, (req, res) => {
  const { title, description } = req.body;
  db.run(
    "INSERT INTO reports (user_id, title, description) VALUES (?, ?, ?)",
    [req.session.user.id, title, description],
    function (err) {
      if (err) return res.status(500).send("Error creating report");
      res.send("Report created successfully!");
    }
  );
});

// --- Admin Routes ---
app.get("/api/admin/users", requireLogin, (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send("Forbidden");
  db.all("SELECT id, name, email, created_at FROM users", [], (err, rows) => {
    if (err) return res.status(500).send("Error fetching users");
    res.json(rows);
  });
});

app.get("/api/admin/reports", requireLogin, (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send("Forbidden");
  db.all(
    `SELECT r.id, r.title, r.description, r.date, u.name as user_name, u.email as user_email
     FROM reports r JOIN users u ON r.user_id = u.id`,
    [],
    (err, rows) => {
      if (err) return res.status(500).send("Error fetching reports");
      res.json(rows);
    }
  );
});

app.delete("/api/admin/users/:id", requireLogin, (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send("Forbidden");
  db.run("DELETE FROM users WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).send("Error deleting user");
    res.send("User deleted successfully");
  });
});

app.delete("/api/admin/reports/:id", requireLogin, (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send("Forbidden");
  db.run("DELETE FROM reports WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).send("Error deleting report");
    res.send("Report deleted successfully");
  });
});

// --- SHOP PAGE ROUTE ---
app.get("/shop", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "shop.html"));
});

// Serve the customer dashboard page
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// --- API route to fetch products ---
app.get("/api/products", (req, res) => {
  db.all("SELECT * FROM products", (err, rows) => {
    if (err) {
      console.error("Error fetching products:", err);
      res.status(500).json({ error: "Failed to load products" });
    } else {
      res.json(rows);
    }
  });
});

// === CHECKOUT ROUTE ===
app.post("/checkout", (req, res) => {
  const { customer_name, cart } = req.body;

  if (!cart || cart.length === 0) {
    return res.status(400).json({ message: "Cart is empty" });
  }

  const items = cart.map(item => `${item.name} (₦${item.price})`).join(", ");
  const total = cart.reduce((sum, item) => sum + item.price, 0);

  db.run(
    `INSERT INTO orders (customer_name, items, total) VALUES (?, ?, ?)`,
    [customer_name || "Guest", items, total],
    function (err) {
      if (err) {
        console.error("Error saving order:", err);
        return res.status(500).json({ message: "Failed to save order" });
      }
      res.json({ success: true, order_id: this.lastID });
    }
  );
});

// === ADMIN VIEW ORDERS ROUTE ===
app.get("/admin/orders", (req, res) => {
  db.all("SELECT * FROM orders ORDER BY created_at DESC", (err, rows) => {
    if (err) {
      console.error("Error fetching orders:", err);
      return res.status(500).json({ message: "Failed to fetch orders" });
    }
    res.json(rows);
  });
});



// Get current logged-in user info
app.get("/api/user", requireLogin, (req, res) => {
  res.json({ name: req.session.user.name, email: req.session.user.email });
});

// --- Admin API (add to server.js) ---
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).send("Unauthorized");
  if (!req.session.user.is_admin) return res.status(403).send("Forbidden");
  next();
}

// --- Admin analytics & CSV export (add to server.js) ---
app.get("/api/admin/analytics", requireLogin, requireAdmin, (req, res) => {
  // total users, total reports, most recent signup
  db.get("SELECT COUNT(*) AS totalUsers, MAX(created_at) AS lastSignup FROM users", [], (uErr, uRow) => {
    if (uErr) return res.status(500).json({ success: false, message: "DB error" });

    db.get("SELECT COUNT(*) AS totalReports FROM reports", [], (rErr, rRow) => {
      if (rErr) return res.status(500).json({ success: false, message: "DB error" });

      return res.json({
        success: true,
        analytics: {
          totalUsers: uRow.totalUsers || 0,
          totalReports: rRow.totalReports || 0,
          lastSignup: uRow.lastSignup || null
        }
      });
    });
  });
});

// CSV helper: escape fields for CSV
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // if contains quote, newline or comma, wrap in quotes and escape quotes
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// --- Enhanced Export with Filters ---
app.get("/api/admin/export", requireLogin, requireAdmin, (req, res) => {
  const { from, to, user_id } = req.query;

  let sql = `
    SELECT r.id, r.title, r.description, r.date, r.user_id,
           u.name AS user_name, u.email AS user_email
    FROM reports r
    JOIN users u ON r.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (from) {
    sql += " AND date(r.date) >= date(?)";
    params.push(from);
  }
  if (to) {
    sql += " AND date(r.date) <= date(?)";
    params.push(to);
  }
  if (user_id) {
    sql += " AND r.user_id = ?";
    params.push(user_id);
  }

  sql += " ORDER BY r.date DESC";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).send("DB error");

    const headers = ["id", "title", "description", "date", "user_id", "user_name", "user_email"];
    const csvRows = [headers.join(",")];

    rows.forEach(r => {
      const row = [
        csvEscape(r.id),
        csvEscape(r.title),
        csvEscape(r.description),
        csvEscape(r.date),
        csvEscape(r.user_id),
        csvEscape(r.user_name),
        csvEscape(r.user_email)
      ];
      csvRows.push(row.join(","));
    });

    const csvText = csvRows.join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "inline; filename=filtered_reports.csv");
    res.send(csvText);
  });
});

// Serve admin UI at /admin
app.get("/admin", requireLogin, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Get all users (id, name, email, is_admin, created_at)
app.get("/api/admin/users", requireLogin, requireAdmin, (req, res) => {
  db.all("SELECT id, name, email, is_admin, created_at FROM users", [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: "DB error" });
    res.json({ success: true, users: rows });
  });
});

// Update a user (name, email, is_admin)
app.put("/api/admin/users/:id", requireLogin, requireAdmin, (req, res) => {
  const id = req.params.id;
  const { name, email, is_admin } = req.body;
  db.run(
    "UPDATE users SET name = ?, email = ?, is_admin = ? WHERE id = ?",
    [name, email, is_admin ? 1 : 0, id],
    function (err) {
      if (err) return res.status(500).json({ success: false, message: "DB error" });
      res.json({ success: true, message: "User updated" });
    }
  );
});

// Delete a user (and their reports)
app.delete("/api/admin/users/:id", requireLogin, requireAdmin, (req, res) => {
  const id = req.params.id;
  db.get("SELECT email FROM users WHERE id = ?", [id], (err, userRow) => {
    if (err) return res.status(500).json({ success: false, message: "DB error" });
    if (!userRow) return res.status(404).json({ success: false, message: "User not found" });

    db.run("DELETE FROM reports WHERE user_id = ?", [id], (err2) => {
      if (err2) console.error("Error deleting user reports:", err2);
      db.run("DELETE FROM users WHERE id = ?", [id], function (err3) {
        if (err3) return res.status(500).json({ success: false, message: "DB error" });
        res.json({ success: true, message: "User and their reports deleted" });
      });
    });
  });
});

// --- UPDATE Product (Admin Only) ---
app.put("/api/admin/products/:id", requireLogin, (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send("Forbidden");

  const { name, price, image } = req.body;
  const id = req.params.id;

  if (!name || !price) {
    return res.status(400).json({ error: "Name and price are required" });
  }

  db.run(
    "UPDATE products SET name = ?, price = ?, image = ? WHERE id = ?",
    [name, price, image || null, id],
    function (err) {
      if (err) return res.status(500).json({ error: "Failed to update product" });
      if (this.changes === 0)
        return res.status(404).json({ error: "Product not found" });

      res.json({ success: true, message: "Product updated successfully" });
    }
  );
});

// --- ADD Product (Admin Only) ---
app.post("/api/admin/products", requireLogin, upload.single("image"), (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send("Forbidden");

  const { name, price } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  if (!name || !price) {
    return res.status(400).json({ error: "Name and price are required" });
  }

  db.run(
    "INSERT INTO products (name, price, image) VALUES (?, ?, ?)",
    [name, price, image],
    function (err) {
      if (err) return res.status(500).json({ error: "Failed to add product" });
      res.json({ success: true, id: this.lastID });
    }
  );
});


// Get all reports with user info
app.get("/api/admin/reports", requireLogin, requireAdmin, (req, res) => {
  const sql = `
    SELECT r.id, r.title, r.description, r.date, r.user_id,
           u.name AS user_name, u.email AS user_email
    FROM reports r
    JOIN users u ON r.user_id = u.id
    ORDER BY r.date DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: "DB error" });
    res.json({ success: true, reports: rows });
  });
});

// Update a report
app.put("/api/admin/reports/:id", requireLogin, requireAdmin, (req, res) => {
  const id = req.params.id;
  const { title, description } = req.body;
  db.run(
    "UPDATE reports SET title = ?, description = ? WHERE id = ?",
    [title, description, id],
    function (err) {
      if (err) return res.status(500).json({ success: false, message: "DB error" });
      res.json({ success: true, message: "Report updated" });
    }
  );
});

// Delete a report
app.delete("/api/admin/reports/:id", requireLogin, requireAdmin, (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM reports WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ success: false, message: "DB error" });
    res.json({ success: true, message: "Report deleted" });
  });
});

// --- Universal Search (users + reports) ---
app.get("/api/admin/search", requireLogin, requireAdmin, (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ users: [], reports: [] });

  const likeQ = `%${q}%`;
  const results = {};

  db.all(
    "SELECT id, name, email FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY name LIMIT 20",
    [likeQ, likeQ],
    (err, users) => {
      if (err) return res.status(500).send("DB error");
      results.users = users || [];

      db.all(
        "SELECT r.id, r.title, r.description, r.date, u.name AS user_name, u.email AS user_email FROM reports r JOIN users u ON r.user_id = u.id WHERE r.title LIKE ? OR r.description LIKE ? OR u.name LIKE ? OR u.email LIKE ? ORDER BY r.date DESC LIMIT 20",
        [likeQ, likeQ, likeQ, likeQ],
        (err2, reports) => {
          if (err2) return res.status(500).send("DB error");
          results.reports = reports || [];
          res.json(results);
        }
      );
    }
  );
});

// cart route
app.get("/cart", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "cart.html"));
});

// --- CHECKOUT API ---
app.post("/checkout", (req, res) => {
  const { user_email, cart, total } = req.body;

  if (!cart || cart.length === 0) {
    return res.status(400).json({ message: "Cart is empty" });
  }

  const cartData = JSON.stringify(cart);
  db.run(
    "INSERT INTO orders (user_email, items, total_price) VALUES (?, ?, ?)",
    [user_email || "guest", cartData, total],
    function (err) {
      if (err) {
        console.error("Error saving order:", err);
        res.status(500).json({ message: "Failed to save order" });
      } else {
        res.json({ message: "Order placed successfully", orderId: this.lastID });
      }
    }
  );
});

// --- Checkout Route ---
app.post("/checkout", (req, res) => {
  const { cart, total } = req.body;
  const user_id = req.session.userId || null; // If logged in, link to user

  if (!cart || cart.length === 0) {
    return res.status(400).send("Cart is empty");
  }

  const cartJSON = JSON.stringify(cart);

  db.run(
    `INSERT INTO orders (user_id, items, total) VALUES (?, ?, ?)`,
    [user_id, cartJSON, total],
    function (err) {
      if (err) {
        console.error("Error saving order:", err);
        return res.status(500).send("Error saving order");
      }
      res.json({ success: true, orderId: this.lastID });
    }
  );
});

// --- Admin view: get all orders ---
app.get("/admin/orders", (req, res) => {
  // (Optional) You can later restrict this to admin sessions only
  db.all("SELECT * FROM orders ORDER BY created_at DESC", (err, rows) => {
    if (err) {
      console.error("Error fetching orders:", err);
      return res.status(500).json({ error: "Failed to fetch orders" });
    }
    res.json(rows);
  });
});


// --- Get Orders for Logged-In User ---
app.get("/my-orders", (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).send("Please log in to view your orders");
  }

  db.all(
    `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        console.error("Error fetching orders:", err);
        return res.status(500).send("Error fetching orders");
      }
      res.json(rows);
    }
  );
});


app.post('/checkout', (req, res) => {
  const cart = req.body.cart;
  if (!cart || cart.length === 0) return res.status(400).json({ message: 'Empty cart' });

  // (Later we’ll integrate Paystack/Flutterwave here)
  console.log('Checkout received:', cart);
  res.json({ message: 'Payment successful! Order confirmed 🎉' });
});

app.post("/checkout", (req, res) => {
  const { customer_name, customer_email, cart, total } = req.body;

  const items = JSON.stringify(cart);

  db.run(
    `INSERT INTO orders (customer_name, customer_email, items, total)
     VALUES (?, ?, ?, ?)`,
    [customer_name, customer_email, items, total],
    (err) => {
      if (err) {
        console.error("Error saving order:", err);
        res.json({ success: false });
      } else {
        res.json({ success: true });
      }
    }
  );
});

// ✅ Add product from admin panel
app.post("/admin/add-product", upload.single("image"), (req, res) => {
  const { name, price, description } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  if (!name || !price) {
    return res.status(400).json({ error: "Missing name or price" });
  }

  db.run(
    "INSERT INTO products (name, price, description, image) VALUES (?, ?, ?, ?)",
    [name, price, description, image],
    function (err) {
      if (err) {
        console.error("Error adding product:", err);
        return res.status(500).json({ error: "Failed to add product" });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

//ets
// multer setup



// --- Add product route ---
app.post("/add-product", upload.single("image"), (req, res) => {
  const { name, price, description } = req.body;
  const image = req.file ? "/uploads/" + req.file.filename : "";

  const sql = "INSERT INTO products (name, price, description, image) VALUES (?, ?, ?, ?)";
  db.run(sql, [name, price, description, image], (err) => {
    if (err) {
      console.error("Error adding product:", err);
      return res.status(500).send("Error adding product");
    }
    console.log("✅ Product added successfully:", name);
    res.redirect("/admin.html");
  });
});


// Public pages
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/signup", (req, res) => res.sendFile(path.join(__dirname, "public", "signup.html")));
app.get("/shop", (req, res) => res.sendFile(path.join(__dirname, "public", "shop.html")));

// Protected page (dashboard)
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// API to fetch logged-in user info
app.get("/api/user", (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: "Not logged in" });
  res.json(req.session.user);
});

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});


// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.send("Logged out");
  });
});

// --- Start server ---
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));