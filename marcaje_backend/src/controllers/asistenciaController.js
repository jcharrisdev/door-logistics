const bcrypt = require('bcryptjs');
const db = require('../db');
const dayjs = require('dayjs');

// POST /api/asistencia/buscar-empleado
exports.buscarEmpleado = async (req, res) => {
  try {
    const { numeroId } = req.body;
    const [[empleado]] = await db.query(
      `SELECT id, nombre, apellido, cargo, departamento, tipo_id, numero_id
       FROM empleados WHERE numero_id = ? AND activo = TRUE`,
      [numeroId]
    );

    if (!empleado) {
      return res.status(404).json({ success: false, message: 'Empleado no encontrado' });
    }

    // Obtener estado actual del día
    const hoy = dayjs().format('YYYY-MM-DD');
    const [marcajes] = await db.query(
      `SELECT tipo, timestamp FROM marcajes
       WHERE empleado_id = ? AND DATE(timestamp) = ?
       ORDER BY timestamp ASC`,
      [empleado.id, hoy]
    );

    const tiposSig = ['entrada', 'salida_almuerzo', 'regreso_almuerzo', 'salida_dia'];
    const siguienteMarcaje = tiposSig[marcajes.length] || null;

    // Verificar si el último marcaje fue hace menos de 15 minutos
    let bloqueado = false;
    let minutosRestantes = 0;
    if (marcajes.length > 0) {
      const ultimo = dayjs(marcajes[marcajes.length - 1].timestamp);
      const diff = dayjs().diff(ultimo, 'minute');
      if (diff < 15) {
        bloqueado = true;
        minutosRestantes = 15 - diff;
      }
    }

    res.json({
      success: true,
      empleado: {
        id: empleado.id,
        nombre: `${empleado.nombre} ${empleado.apellido}`,
        cargo: empleado.cargo || '',
        departamento: empleado.departamento || '',
        numeroId: empleado.numero_id,
        tipoId: empleado.tipo_id,
      },
      siguienteMarcaje,
      marcajesHoy: marcajes.length,
      bloqueado,
      minutosRestantes,
    });
  } catch (err) {
    console.error('buscarEmpleado error:', err);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
};

// POST /api/asistencia/marcar
exports.marcar = async (req, res) => {
  try {
    const { empleadoId, pin, metodo } = req.body;

    const [[empleado]] = await db.query(
      'SELECT * FROM empleados WHERE id = ? AND activo = TRUE',
      [empleadoId]
    );

    if (!empleado) {
      return res.status(404).json({ success: false, message: 'Empleado no encontrado' });
    }

    // Validar PIN
    if (metodo === 'pin' || metodo === 'id_pin') {
      const pinOk = await bcrypt.compare(pin, empleado.pin_hash);
      if (!pinOk) {
        return res.status(401).json({ success: false, message: 'PIN incorrecto' });
      }
    }

    // Validar QR token
    if (metodo === 'qr') {
      if (pin !== empleado.qr_token) {
        return res.status(401).json({ success: false, message: 'QR inválido' });
      }
    }

    const hoy = dayjs().format('YYYY-MM-DD');
    const [marcajes] = await db.query(
      `SELECT tipo, timestamp FROM marcajes
       WHERE empleado_id = ? AND DATE(timestamp) = ?
       ORDER BY timestamp ASC`,
      [empleado.id, hoy]
    );

    // Validar 15 minutos
    if (marcajes.length > 0) {
      const ultimo = dayjs(marcajes[marcajes.length - 1].timestamp);
      const diff = dayjs().diff(ultimo, 'minute');
      if (diff < 15) {
        return res.status(429).json({
          success: false,
          message: `Debes esperar ${15 - diff} minutos más para marcar nuevamente`,
        });
      }
    }

    // Determinar tipo de marcaje
    const tiposSig = ['entrada', 'salida_almuerzo', 'regreso_almuerzo', 'salida_dia'];
    if (marcajes.length >= 4) {
      return res.status(400).json({
        success: false,
        message: 'Ya completaste todos los marcajes del día',
      });
    }

    const tipo = tiposSig[marcajes.length];
    const metodoDb = metodo === 'qr' ? 'qr' : 'pin';

    await db.query(
      'INSERT INTO marcajes (empleado_id, tipo, metodo, ip_dispositivo) VALUES (?, ?, ?, ?)',
      [empleado.id, tipo, metodoDb, req.ip]
    );

    const tiposLabel = {
      entrada: 'Entrada',
      salida_almuerzo: 'Salida a almuerzo',
      regreso_almuerzo: 'Regreso de almuerzo',
      salida_dia: 'Salida del día',
    };

    res.json({
      success: true,
      employee: {
        id: empleado.id,
        name: `${empleado.nombre} ${empleado.apellido}`,
        position: empleado.cargo || '',
      },
      type: tipo,
      typeLabel: tiposLabel[tipo],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('marcar error:', err);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
};

// GET /api/asistencia/hoy
exports.asistenciaHoy = async (req, res) => {
  try {
    const hoy = dayjs().format('YYYY-MM-DD');
    const [rows] = await db.query(`
      SELECT
        e.id,
        CONCAT(e.nombre, ' ', e.apellido) AS nombre,
        e.cargo, e.departamento, e.numero_id,
        MAX(CASE WHEN m.tipo = 'entrada'          THEN m.timestamp END) AS entrada,
        MAX(CASE WHEN m.tipo = 'salida_almuerzo'  THEN m.timestamp END) AS salida_almuerzo,
        MAX(CASE WHEN m.tipo = 'regreso_almuerzo' THEN m.timestamp END) AS regreso_almuerzo,
        MAX(CASE WHEN m.tipo = 'salida_dia'       THEN m.timestamp END) AS salida_dia,
        COUNT(m.id) AS total_marcajes
      FROM empleados e
      LEFT JOIN marcajes m ON m.empleado_id = e.id AND DATE(m.timestamp) = ?
      WHERE e.activo = TRUE
      GROUP BY e.id
      ORDER BY e.departamento, e.apellido
    `, [hoy]);

    res.json({ success: true, fecha: hoy, data: rows });
  } catch (err) {
    console.error('asistenciaHoy error:', err);
    res.status(500).json({ success: false, message: 'Error obteniendo asistencia' });
  }
};