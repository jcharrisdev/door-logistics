require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Ruta ${req.path} no encontrada` });
});

app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`   POST /api/auth/login`);
  console.log(`   POST /api/asistencia/marcar`);
  console.log(`   GET  /api/asistencia/hoy`);
  console.log(`   GET  /api/reportes/dia?fecha=YYYY-MM-DD`);
  console.log(`   GET  /api/reportes/rango?inicio=YYYY-MM-DD&fin=YYYY-MM-DD`);
  console.log(`   GET  /api/reportes/empleado/:id?inicio=...&fin=...`);
  console.log(`   GET  /api/reportes/mensual?anio=2026&mes=3\n`);
});