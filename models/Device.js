// models/Device.js MEJORADO
import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  deviceId: { 
    type: String, 
    required: true,
    index: true
  },
  userAgent: { 
    type: String,
    default: ''
  },
  ip: { 
    type: String,
    default: ''
  },
  lastSeen: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  isActive: { 
    type: Boolean, 
    default: true,
    index: true
  },
  // Nuevos campos para mejor tracking
  deviceType: {
    type: String,
    enum: ['mobile', 'tablet', 'desktop', 'tv', 'unknown'],
    default: 'unknown'
  },
  browser: {
    type: String,
    default: ''
  },
  os: {
    type: String,
    default: ''
  },
  loginCount: {
    type: Number,
    default: 1
  },
  firstSeen: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true,
  // Optimización para consultas frecuentes
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices compuestos para optimizar consultas
deviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
deviceSchema.index({ userId: 1, isActive: 1 });
deviceSchema.index({ isActive: 1, lastSeen: 1 });

// Virtual para calcular tiempo desde última conexión
deviceSchema.virtual('timeSinceLastSeen').get(function() {
  if (!this.lastSeen) return null;
  return Date.now() - this.lastSeen.getTime();
});

// Virtual para determinar si el dispositivo está "stale" (más de 7 días sin actividad)
deviceSchema.virtual('isStale').get(function() {
  if (!this.lastSeen) return true;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return this.lastSeen < sevenDaysAgo;
});

// Método estático para limpiar dispositivos inactivos
deviceSchema.statics.cleanupInactive = async function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return await this.deleteMany({
    isActive: false,
    lastSeen: { $lt: cutoffDate }
  });
};

// Método estático para desactivar dispositivos obsoletos
deviceSchema.statics.deactivateStale = async function(daysOld = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return await this.updateMany(
    {
      isActive: true,
      lastSeen: { $lt: cutoffDate }
    },
    { isActive: false }
  );
};

// Método para actualizar información del dispositivo
deviceSchema.methods.updateInfo = function(userAgent, ip) {
  this.userAgent = userAgent || this.userAgent;
  this.ip = ip || this.ip;
  this.lastSeen = new Date();
  this.loginCount += 1;
  
  // Detectar tipo de dispositivo y navegador
  if (userAgent) {
    this.deviceType = this.detectDeviceType(userAgent);
    this.browser = this.detectBrowser(userAgent);
    this.os = this.detectOS(userAgent);
  }
  
  return this.save();
};

// Método para detectar tipo de dispositivo
deviceSchema.methods.detectDeviceType = function(userAgent) {
  if (!userAgent) return 'unknown';
  
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android')) return 'mobile';
  if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet';
  if (ua.includes('smart-tv') || ua.includes('smarttv')) return 'tv';
  return 'desktop';
};

// Método para detectar navegador
deviceSchema.methods.detectBrowser = function(userAgent) {
  if (!userAgent) return '';
  
  const ua = userAgent.toLowerCase();
  if (ua.includes('chrome')) return 'Chrome';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('edge')) return 'Edge';
  if (ua.includes('opera')) return 'Opera';
  return 'Unknown';
};

// Método para detectar sistema operativo
deviceSchema.methods.detectOS = function(userAgent) {
  if (!userAgent) return '';
  
  const ua = userAgent.toLowerCase();
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('mac os')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('ios')) return 'iOS';
  return 'Unknown';
};

// Middleware pre-save para actualizar campos automáticamente
deviceSchema.pre('save', function(next) {
  if (this.isNew) {
    this.firstSeen = new Date();
  }
  
  if (this.userAgent && (!this.deviceType || this.deviceType === 'unknown')) {
    this.deviceType = this.detectDeviceType(this.userAgent);
    this.browser = this.detectBrowser(this.userAgent);
    this.os = this.detectOS(this.userAgent);
  }
  
  next();
});

export default mongoose.model('Device', deviceSchema);
