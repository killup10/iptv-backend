import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

// ⚙️ Cargar las variables del archivo .env
dotenv.config();

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectado a MongoDB");

    const username = "Adminkillup";
    const plainPassword = "Alptraum100";

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      console.log("⚠️ El usuario ya existe:", username);
      return;
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const newUser = new User({
      username,
      password: hashedPassword,
      role: "admin",
      isActive: true,
      deviceId: "admin-device",
    });

    await newUser.save();
    console.log("✅ Usuario administrador creado con éxito.");
  } catch (error) {
    console.error("❌ Error al crear el admin:", error);
  } finally {
    mongoose.disconnect();
  }
}

createAdmin();
