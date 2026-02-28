#!/bin/bash
echo "🔁 Restoring KaffySeni environment..."

# Remove existing node_modules and lock file
rm -rf node_modules package-lock.json

# Reinstall exact stable versions
npm install express@4.18.2 body-parser@1.20.3 sqlite3@5.1.7 nodemailer@6.9.12 express-session@1.17.3 --save-exact

echo "✅ KaffySeni environment restored successfully!"
