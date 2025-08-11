import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

dotenv.config();

const generateToken = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const user = await User.findOne({ username: 'Userdemo' });
    if (!user) {
      console.error('Usuario no encontrado');
      return;
    }

    const token = jwt.sign(
      { 
        id: user._id,
        username: user.username,
        role: user.role,
        plan: user.plan
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('Token para Userdemo:');
    console.log(token);
    console.log('\nGuarda este token en localStorage con la clave "token"');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

generateToken();
