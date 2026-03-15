const express = require('express');
const router = express.Router();

const authCtrl       = require('../controllers/authController');
const asistenciaCtrl = require('../controllers/asistenciaController');
const reportesCtrl   = require('../controllers/reportesController');
const adminCtrl      = require('../controllers/adminController');
const { authMiddleware } = require('../middleware/auth');

// ─── Auth ─────────────────────────────────────────────────────
router.post('/auth/login',                    authCtrl.login);

// ─── Marcaje (tablet) ─────────────────────────────────────────
router.post('/asistencia/buscar-empleado',    asistenciaCtrl.buscarEmpleado);
router.post('/asistencia/marcar',             asistenciaCtrl.marcar);
router.get('/asistencia/hoy',                 authMiddleware, asistenciaCtrl.asistenciaHoy);

// ─── Admin ────────────────────────────────────────────────────
router.post('/admin/login-pin',               adminCtrl.loginPin);
router.get('/admin/dashboard',                authMiddleware, adminCtrl.dashboard);
router.get('/admin/empleados',                authMiddleware, adminCtrl.listarEmpleados);
router.post('/admin/empleados',               authMiddleware, adminCtrl.crearEmpleado);
router.put('/admin/empleados/:id',            authMiddleware, adminCtrl.editarEmpleado);
router.put('/admin/empleados/:id/toggle',     authMiddleware, adminCtrl.toggleEmpleado);
router.get('/admin/historial',                authMiddleware, adminCtrl.historial);

// ─── Reportes CSV ─────────────────────────────────────────────
router.get('/reportes/dia',                   authMiddleware, reportesCtrl.exportarDia);
router.get('/reportes/rango',                 authMiddleware, reportesCtrl.exportarRango);
router.get('/reportes/empleado/:id',          authMiddleware, reportesCtrl.exportarEmpleado);
router.get('/reportes/mensual',               authMiddleware, reportesCtrl.exportarMensual);

// ─── Health ───────────────────────────────────────────────────
router.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

module.exports = router;