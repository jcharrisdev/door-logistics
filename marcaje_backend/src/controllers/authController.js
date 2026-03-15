const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const [[usuario]] = await db.query(
      'SELECT * FROM usuarios_admin WHERE email = ? AND activo = TRUE', [email]
    );

    if (!usuario) {
      return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
    }

    const passwordOk = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
    }

    await db.query(
      'UPDATE usuarios_admin SET ultimo_login = NOW() WHERE id = ?', [usuario.id]
    );

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      success: true,
      token,
      user: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
};