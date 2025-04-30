// scripts/resetAdminPassword.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/User.js"; // Asegúrate que el modelo está bien importado

const resetPassword = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectado a MongoDB");

    const user = await User.findOne({ username: "Adminkillup" });
    if (!user) {
      console.log("❌ No se encontró el usuario");
      return;
    }

    user.password = await bcrypt.hash("Alptraum100", 10);
    await user.save();

    console.log("✅ Contraseña actualizada correctamente");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    mongoose.disconnect();
  }
};

resetPassword();
