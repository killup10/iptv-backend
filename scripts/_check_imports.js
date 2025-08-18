// quick import check for syntax errors
(async function(){
  try {
    console.log('Checking imports...');
    const a = await import('../controllers/progress.controller.js');
    const b = await import('../models/UserProgress.js');
    console.log('OK', Object.keys(a), Object.keys(b));
  } catch (e) {
    console.error('Import error', e);
    process.exit(1);
  }
})();
