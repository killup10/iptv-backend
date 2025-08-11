import User from '../models/User.js';

// Función para verificar si el usuario puede acceder a contenido premium
export const checkPremiumAccess = async (req, res, next) => {
  try {
    const user = req.user;
    const requestedContent = req.requestedContent; // Será establecido por el controlador
    
    if (!user || !requestedContent) {
      return next();
    }

    // Si es admin, permitir acceso completo
    if (user.role === 'admin') {
      req.hasAccess = true;
      return next();
    }

    // Verificar jerarquía de planes
    const planHierarchy = { 'gplay': 1, 'estandar': 2, 'sports': 3, 'cinefilo': 4, 'premium': 5 };
    const userPlanLevel = planHierarchy[user.plan] || 0;
    
    // Verificar si el contenido requiere un plan específico
    const requiredPlans = requestedContent.requiresPlan || [];
    const hasDirectAccess = requiredPlans.length === 0 || requiredPlans.some(requiredPlan => {
      const requiredPlanLevel = planHierarchy[requiredPlan] || 0;
      return userPlanLevel >= requiredPlanLevel;
    });

    if (hasDirectAccess) {
      req.hasAccess = true;
      return next();
    }

    // Si no tiene acceso directo, verificar prueba gratuita diaria
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const userDoc = await User.findById(user.id);
    
    // Resetear contador si es un nuevo día
    if (!userDoc.dailyTrialUsage.date || userDoc.dailyTrialUsage.date < today) {
      userDoc.dailyTrialUsage.date = today;
      userDoc.dailyTrialUsage.minutesUsed = 0;
      await userDoc.save();
    }

    // Verificar si aún tiene tiempo de prueba disponible
    const minutesRemaining = userDoc.dailyTrialUsage.maxMinutesPerDay - userDoc.dailyTrialUsage.minutesUsed;
    
    if (minutesRemaining > 0) {
      req.hasAccess = true;
      req.isTrialAccess = true;
      req.trialMinutesRemaining = minutesRemaining;
      return next();
    }

    // No tiene acceso ni tiempo de prueba
    req.hasAccess = false;
    req.trialMinutesRemaining = 0;
    next();

  } catch (error) {
    console.error('Error en checkPremiumAccess:', error);
    req.hasAccess = false;
    next();
  }
};

// Función para registrar uso de tiempo de prueba
export const recordTrialUsage = async (userId, minutesUsed) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Asegurar que estamos en el día correcto
    if (!user.dailyTrialUsage.date || user.dailyTrialUsage.date < today) {
      user.dailyTrialUsage.date = today;
      user.dailyTrialUsage.minutesUsed = 0;
    }

    // Incrementar minutos usados
    user.dailyTrialUsage.minutesUsed = Math.min(
      user.dailyTrialUsage.minutesUsed + minutesUsed,
      user.dailyTrialUsage.maxMinutesPerDay
    );

    await user.save();
    console.log(`Usuario ${user.username} usó ${minutesUsed} minutos de prueba. Total: ${user.dailyTrialUsage.minutesUsed}/${user.dailyTrialUsage.maxMinutesPerDay}`);
  } catch (error) {
    console.error('Error registrando uso de prueba:', error);
  }
};
