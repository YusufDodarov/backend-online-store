require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const authMiddleware = require("./authMiddleware");
const pool = require("./db");
const app = express();
const multer = require("multer");
const upload = multer();
const categoryRoutes = require("./categoryRoutes");
const colorRoutes = require("./colorRoutes");
const cloudinary = require("./cloudinary");
const brandRoutes = require("./brandRoutes");
const productRoutes = require("./productRoutes");
const cartRoutes = require("./cartRoutes");
app.use(cors());
app.use(express.json());
const bcrypt = require("bcrypt");

const admins = [{ userName: "SoftClub", password: "SuperAdmin-323" }];

app.get("/images/:imageName", async (req, res) => {
  try {
    const { imageName } = req.params;
    const publicId = imageName.replace(/\.(jpg|jpeg|png|webp|gif)$/, "");

    // Силкахо барои ҳар ҷойи акс
    const folders = [
      `fastcart/products/${publicId}`,
      `fastcart/categories/${publicId}`,
      `fastcart/users/${publicId}`,
    ];

    for (const folder of folders) {
      try {
        await cloudinary.api.resource(folder);
        const url = cloudinary.url(folder, { secure: true });
        return res.redirect(url);
      } catch (err) {
        // агар акс дар folder набошад, ба folder-и навбатӣ мегузарем
      }
    }

    // Агар акс дар ягон folder набошад
    res.status(404).json({ message: "Image not found" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
app.use("/Brand", brandRoutes);

app.post("/Auth/login", (req, res) => {
  const { userName, password } = req.body;

  const currentYear = new Date().getFullYear();
  const dynamicUserName = `SoftClub${currentYear}`;

  const admin = admins.find(
    (a) =>
      `${a.userName}${currentYear}` === userName && a.password === password,
  );

  if (!admin)
    return res.status(401).json({ message: "Incorrect login or password" });

  const token = jwt.sign(
    { userName: admin.userName, role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
  res.json({ token });
});

app.post("/Account/registration", async (req, res) => {
  try {
    const { userName, email, password, phoneNumber } = req.body;

    if (!userName || userName.length < 4) {
      return res
        .status(400)
        .json({ message: "Username must be at least 4 characters" });
    }

    if (!password || password.length < 4) {
      return res
        .status(400)
        .json({ message: "Password must be at least 4 characters" });
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res
        .status(400)
        .json({ message: "Password must contain letters and numbers" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res
        .status(400)
        .json({ message: "Email must start with at least 5 letters before @" });
    }

    if (!phoneNumber || !/^\d{9}$/.test(phoneNumber)) {
      return res
        .status(505)
        .json({ message: "Phone number must be exactly 9 digits" });
    }

    const fullPhone = `+992${phoneNumber}`;

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO Users (userName, email, password, phoneNumber, role) VALUES ($1, $2, $3, $4, $5)",
      [userName, email, hashedPassword, fullPhone, "user"],
    );

    res.status(201).json({ message: "registered" });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ message: "Email already exists" });
    }
    console.error(err);
    res.status(500).json({ message: "error" });
  }
});
app.post("/Account/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query(
      'SELECT userid AS "userId", password, role FROM Users WHERE email=$1',
      [email],
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Wrong password" });

    const accessToken = jwt.sign(
      { userId: user.userId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "12h" },
    );

    res.json({ accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "error" });
  }
});
app.get("/UserProfile/get-my-profile", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query(
      `SELECT 
        userid AS "userId",
        username AS "userName",
        email,
        phonenumber AS "phoneNumber",
        date AS "dateAt",
        avatar,
        role
       FROM Users WHERE userid=$1`,
      [userId],
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.phoneNumber && user.phoneNumber.startsWith("+992")) {
      user.phoneNumber = user.phoneNumber.slice(4);
    }

    res.json({ data: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "error" });
  }
});

const fs = require("fs");
const path = require("path");
app.post(
  "/UserProfile/add-image-to-profile",
  authMiddleware,
  upload.single("image"),
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const file = req.file;

      if (!file) return res.status(400).json({ message: "No image provided" });

      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ folder: "fastcart/users" }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          })
          .end(file.buffer);
      });

      const avatarName = `${result.public_id.split("/").pop()}.${result.format}`;

      await pool.query(`UPDATE Users SET avatar=$1 WHERE userid=$2`, [
        avatarName,
        userId,
      ]);

      res.json({ message: "Image added to profile", avatar: avatarName });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    }
  },
);

app.delete(
  "/UserProfile/delete-image-from-profile",
  authMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.userId;

      const result = await pool.query(
        `SELECT avatar FROM Users WHERE userid=$1`,
        [userId],
      );

      const user = result.rows[0];
      if (!user) return res.status(404).json({ message: "User not found" });

      if (user.avatar) {
        const avatarPath = path.join(__dirname, "images", user.avatar);
        if (fs.existsSync(avatarPath)) {
          fs.unlinkSync(avatarPath);
        }
      }

      await pool.query(`UPDATE Users SET avatar=null WHERE userid=$1`, [
        userId,
      ]);

      res.json({ message: "Avatar deleted" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  },
);

app.put(
  "/UserProfile/update-user-profile",
  authMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { userName, email, phoneNumber } = req.body;

      const result = await pool.query(
        `SELECT username, email, phonenumber FROM Users WHERE userid=$1`,
        [userId],
      );

      const user = result.rows[0];

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const fullPhone = `+992${phoneNumber}`;

      if (
        user.username === userName &&
        user.email === email &&
        user.phonenumber === fullPhone
      ) {
        return res.status(400).json({
          message: "You didn't change anything",
        });
      }

      await pool.query(
        `UPDATE Users 
       SET username=$1, email=$2, phonenumber=$3 
       WHERE userid=$4`,
        [userName, email, fullPhone, userId],
      );

      res.json({ message: "Profile updated" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  },
);

app.use("/Products", productRoutes);
app.use("/Color", colorRoutes);
app.use("/Category", categoryRoutes);
app.use("/Cart", cartRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
