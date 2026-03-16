import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  runApp(const MarcajeApp());
}

class MarcajeApp extends StatelessWidget {
  const MarcajeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => MarcajeProvider(),
      child: MaterialApp(
        title: 'Door Logistics',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1A56DB)),
          useMaterial3: true,
          fontFamily: 'Roboto',
        ),
        home: const MarcajeScreen(),
      ),
    );
  }
}

// ─── Modelos ──────────────────────────────────────────────────
class EmpleadoInfo {
  final int id;
  final String nombre;
  final String cargo;
  final String departamento;
  final String numeroId;
  final String? siguienteMarcaje;
  final bool bloqueado;
  final int minutosRestantes;

  EmpleadoInfo({
    required this.id,
    required this.nombre,
    required this.cargo,
    required this.departamento,
    required this.numeroId,
    this.siguienteMarcaje,
    this.bloqueado = false,
    this.minutosRestantes = 0,
  });
}

// ─── Provider ─────────────────────────────────────────────────
enum AppState { idle, buscando, confirmando, marcando, exito, error }

class MarcajeProvider extends ChangeNotifier {
static const String apiUrl = 'https://door-logistics.onrender.com/api';
  AppState state = AppState.idle;
  EmpleadoInfo? empleado;
  String? mensaje;
  String? tipoLabel;
  String? errorMsg;

  Future<void> buscarEmpleado(String numeroId) async {
    state = AppState.buscando;
    errorMsg = null;
    notifyListeners();

    try {
      final res = await http.post(
Uri.parse('https://door-logistics.onrender.com/api/asistencia/buscar-empleado'),       headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'numeroId': numeroId}),
      );

      final data = jsonDecode(res.body);
      if (data['success'] == true) {
        empleado = EmpleadoInfo(
          id: data['empleado']['id'],
          nombre: data['empleado']['nombre'],
          cargo: data['empleado']['cargo'],
          departamento: data['empleado']['departamento'],
          numeroId: data['empleado']['numeroId'],
          siguienteMarcaje: data['siguienteMarcaje'],
          bloqueado: data['bloqueado'] ?? false,
          minutosRestantes: data['minutosRestantes'] ?? 0,
        );
        state = AppState.confirmando;
      } else {
        errorMsg = data['message'] ?? 'Empleado no encontrado';
        state = AppState.error;
      }
    } catch (e) {
      errorMsg = 'Error de conexión con el servidor';
      state = AppState.error;
    }

    notifyListeners();
    if (state == AppState.error) {
      Future.delayed(const Duration(seconds: 3), () {
        state = AppState.idle;
        errorMsg = null;
        notifyListeners();
      });
    }
  }

  Future<void> marcarConPin(String pin) async {
    if (empleado == null) return;
    state = AppState.marcando;
    notifyListeners();

    try {
      final res = await http.post(
        Uri.parse('https://door-logistics.onrender.com/api/asistencia/marcar'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'empleadoId': empleado!.id,
          'pin': pin,
          'metodo': 'id_pin',
        }),
      );

      final data = jsonDecode(res.body);
      if (data['success'] == true) {
        tipoLabel = data['typeLabel'];
        state = AppState.exito;
      } else {
        errorMsg = data['message'] ?? 'Error al marcar';
        state = AppState.error;
      }
    } catch (e) {
      errorMsg = 'Error de conexión con el servidor';
      state = AppState.error;
    }

    notifyListeners();
    Future.delayed(const Duration(seconds: 3), () {
      reset();
    });
  }

  Future<void> marcarQR(String qrToken) async {
    state = AppState.marcando;
    notifyListeners();

    try {
      final res = await http.post(
        Uri.parse('https://door-logistics.onrender.com/api/asistencia/marcar'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'empleadoId': empleado?.id,
          'pin': qrToken,
          'metodo': 'qr',
        }),
      );

      final data = jsonDecode(res.body);
      if (data['success'] == true) {
        tipoLabel = data['typeLabel'];
        state = AppState.exito;
      } else {
        errorMsg = data['message'] ?? 'Error al marcar';
        state = AppState.error;
      }
    } catch (e) {
      errorMsg = 'Error de conexión';
      state = AppState.error;
    }

    notifyListeners();
    Future.delayed(const Duration(seconds: 3), reset);
  }

  void reset() {
    state = AppState.idle;
    empleado = null;
    mensaje = null;
    tipoLabel = null;
    errorMsg = null;
    notifyListeners();
  }
}

// ─── Pantalla principal ───────────────────────────────────────
class MarcajeScreen extends StatefulWidget {
  const MarcajeScreen({super.key});

  @override
  State<MarcajeScreen> createState() => _MarcajeScreenState();
}

class _MarcajeScreenState extends State<MarcajeScreen> {
  String _activeTab = 'pin';
  final _idController = TextEditingController();
  String _pin = '';

  static const _primary = Color(0xFF1A56DB);
  static const _bg = Color(0xFFF4F6FA);
  static const _card = Colors.white;

  String get _time {
    final n = DateTime.now();
    return '${n.hour.toString().padLeft(2,'0')}:${n.minute.toString().padLeft(2,'0')}';
  }

  String get _date {
    final n = DateTime.now();
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    return '${dias[n.weekday % 7]}, ${n.day} ${meses[n.month-1]} ${n.year}';
  }

  final _marcajeLabels = {
    'entrada': ('Entrada', Colors.green, Icons.login_rounded),
    'salida_almuerzo': ('Salida almuerzo', Colors.orange, Icons.restaurant_rounded),
    'regreso_almuerzo': ('Regreso almuerzo', Colors.blue, Icons.coffee_rounded),
    'salida_dia': ('Salida del día', Colors.red, Icons.logout_rounded),
  };

  @override
  void dispose() {
    _idController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<MarcajeProvider>();

    return Scaffold(
      backgroundColor: _bg,
      body: Stack(
        children: [
          Row(children: [
            _buildLeftPanel(),
            Expanded(child: _buildRightPanel(provider)),
          ]),
          if (provider.state == AppState.exito) _buildSuccessOverlay(provider),
          if (provider.state == AppState.error) _buildErrorOverlay(provider),
          if (provider.state == AppState.buscando || provider.state == AppState.marcando)
            Container(
              color: Colors.black12,
              child: const Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }

  // ── Panel izquierdo ─────────────────────────────────────────
  Widget _buildLeftPanel() {
    return Container(
      width: 240,
      color: _card,
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: _primary.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(Icons.local_shipping_rounded, color: _primary, size: 22),
            ),
            const SizedBox(width: 10),
            const Expanded(
              child: Text('Door\nLogistics',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800,
                  height: 1.1, letterSpacing: -0.3)),
            ),
          ]),
          const Spacer(),
          StreamBuilder(
            stream: Stream.periodic(const Duration(seconds: 1)),
            builder: (_, __) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_time, style: const TextStyle(
                  fontSize: 44, fontWeight: FontWeight.w800, letterSpacing: -2)),
                const SizedBox(height: 4),
                Text(_date, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
              ],
            ),
          ),
          const SizedBox(height: 24),
          // Leyenda marcajes
          ...['entrada','salida_almuerzo','regreso_almuerzo','salida_dia'].map((k) {
            final info = _marcajeLabels[k]!;
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(children: [
                Icon(info.$3, size: 14, color: info.$2),
                const SizedBox(width: 6),
                Text(info.$1, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
              ]),
            );
          }),
        ],
      ),
    );
  }

  // ── Panel derecho ───────────────────────────────────────────
  Widget _buildRightPanel(MarcajeProvider provider) {
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Registra tu asistencia',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
          const SizedBox(height: 4),
          Text('Selecciona el método de marcaje',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
          const SizedBox(height: 20),
          // Tabs
          Row(children: [
            _tab('pin', 'ID + PIN', Icons.pin_rounded),
            const SizedBox(width: 8),
            _tab('qr', 'QR CODE', Icons.qr_code_rounded),
          ]),
          const SizedBox(height: 24),
          Expanded(child: provider.state == AppState.confirmando
            ? _buildConfirmPanel(provider)
            : _activeTab == 'pin'
              ? _buildPinPanel(provider)
              : _buildQrPanel(provider),
          ),
        ],
      ),
    );
  }

  Widget _tab(String id, String label, IconData icon) {
    final active = _activeTab == id;
    return GestureDetector(
      onTap: () => setState(() { _activeTab = id; _pin = ''; _idController.clear(); }),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        decoration: BoxDecoration(
          color: active ? _primary : _card,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: active ? _primary : Colors.grey.shade200),
        ),
        child: Row(children: [
          Icon(icon, size: 16, color: active ? Colors.white : Colors.grey),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(
            fontSize: 13, fontWeight: FontWeight.w700,
            color: active ? Colors.white : Colors.grey)),
        ]),
      ),
    );
  }

  // ── Panel ID + PIN ──────────────────────────────────────────
  Widget _buildPinPanel(MarcajeProvider provider) {
    return Center(
      child: SizedBox(
        width: 340,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Campo ID
            Container(
              decoration: BoxDecoration(
                color: _card,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: TextField(
                controller: _idController,
                keyboardType: TextInputType.text,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                decoration: InputDecoration(
                  border: InputBorder.none,
                  hintText: 'Cédula / Pasaporte / N° Colaborador',
                  hintStyle: TextStyle(fontSize: 13, color: Colors.grey.shade400),
                ),
              ),
            ),
            const SizedBox(height: 20),
            // PIN dots
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(4, (i) => Container(
                margin: const EdgeInsets.symmetric(horizontal: 8),
                width: 16, height: 16,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: i < _pin.length ? _primary : Colors.transparent,
                  border: Border.all(
                    color: i < _pin.length ? _primary : Colors.grey.shade300,
                    width: 2),
                ),
              )),
            ),
            const SizedBox(height: 4),
            Text('Ingresa tu PIN de 4 dígitos',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade400)),
            const SizedBox(height: 20),
            // Teclado
            ...[['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']].map((row) =>
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: row.map((k) {
                    if (k.isEmpty) return const SizedBox(width: 72, height: 60);
                    return GestureDetector(
                      onTap: () {
                        setState(() {
                          if (k == '⌫') {
                            if (_pin.isNotEmpty) _pin = _pin.substring(0, _pin.length - 1);
                          } else if (_pin.length < 4) {
                            _pin += k;
                            if (_pin.length == 4 && _idController.text.trim().isNotEmpty) {
                              _submitIdPin(provider);
                            }
                          }
                        });
                      },
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 6),
                        width: 72, height: 60,
                        decoration: BoxDecoration(
                          color: _card,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        alignment: Alignment.center,
                        child: Text(k, style: const TextStyle(
                          fontSize: 22, fontWeight: FontWeight.w700)),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _submitIdPin(MarcajeProvider provider) async {
    final id = _idController.text.trim();
    final pin = _pin;
    if (id.isEmpty || pin.length < 4) return;

    await provider.buscarEmpleado(id);

    if (provider.state == AppState.confirmando) {
      if (provider.empleado!.bloqueado) {
        provider.errorMsg = 'Debes esperar ${provider.empleado!.minutosRestantes} minutos más';
        provider.state = AppState.error;
        provider.notifyListeners();
        Future.delayed(const Duration(seconds: 3), () {
          setState(() => _pin = '');
          provider.reset();
        });
        return;
      }
      await provider.marcarConPin(pin);
      setState(() { _pin = ''; _idController.clear(); });
    }
  }

  // ── Panel QR ────────────────────────────────────────────────
  Widget _buildQrPanel(MarcajeProvider provider) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 200, height: 200,
            decoration: BoxDecoration(
              border: Border.all(color: _primary, width: 2),
              borderRadius: BorderRadius.circular(16),
              color: _card,
            ),
            child: Icon(Icons.qr_code_scanner_rounded, size: 90, color: _primary),
          ),
          const SizedBox(height: 16),
          Text('Apunta la cámara al código QR de tu carnet',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: () async {
              await provider.buscarEmpleadoQR('QR-EMP-001');
            },
            icon: const Icon(Icons.qr_code_rounded),
            label: const Text('Simular QR (prueba)',
              style: TextStyle(fontWeight: FontWeight.w700)),
            style: ElevatedButton.styleFrom(
              backgroundColor: _primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ],
      ),
    );
  }

  // ── Panel confirmación ──────────────────────────────────────
  Widget _buildConfirmPanel(MarcajeProvider provider) {
    final emp = provider.empleado!;
    final sig = emp.siguienteMarcaje;
    final info = sig != null ? _marcajeLabels[sig] : null;

    return Center(
      child: Container(
        width: 380,
        padding: const EdgeInsets.all(28),
        decoration: BoxDecoration(
          color: _card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.grey.shade100),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64, height: 64,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _primary.withOpacity(0.1),
              ),
              child: Center(
                child: Text(emp.nombre.substring(0, 1),
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: _primary)),
              ),
            ),
            const SizedBox(height: 16),
            Text(emp.nombre,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(emp.cargo,
              style: TextStyle(fontSize: 14, color: Colors.grey.shade500)),
            Text(emp.departamento,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade400)),
            const SizedBox(height: 20),
            if (info != null) Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              decoration: BoxDecoration(
                color: info.$2.withOpacity(0.1),
                borderRadius: BorderRadius.circular(30),
                border: Border.all(color: info.$2.withOpacity(0.3)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(info.$3, color: info.$2, size: 18),
                const SizedBox(width: 8),
                Text(info.$1,
                  style: TextStyle(color: info.$2,
                    fontWeight: FontWeight.w700, letterSpacing: 0.5)),
              ]),
            ),
            const SizedBox(height: 16),
            Text('Procesando marcaje...',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade400)),
          ],
        ),
      ),
    );
  }

  // ── Overlay éxito ───────────────────────────────────────────
  Widget _buildSuccessOverlay(MarcajeProvider provider) {
    return Container(
      color: Colors.white.withOpacity(0.96),
      child: Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(
            width: 100, height: 100,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.green.shade50,
              border: Border.all(color: Colors.green, width: 2),
            ),
            child: const Icon(Icons.check_rounded, size: 56, color: Colors.green),
          ),
          const SizedBox(height: 24),
          Text(provider.empleado?.nombre ?? '',
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text(provider.empleado?.cargo ?? '',
            style: TextStyle(fontSize: 14, color: Colors.grey.shade500)),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.green.shade50,
              borderRadius: BorderRadius.circular(30),
              border: Border.all(color: Colors.green.shade200),
            ),
            child: Text(provider.tipoLabel ?? '',
              style: TextStyle(color: Colors.green.shade700,
                fontWeight: FontWeight.w700, letterSpacing: 1)),
          ),
          const SizedBox(height: 16),
          Text(_time, style: const TextStyle(
            fontSize: 52, fontWeight: FontWeight.w800, letterSpacing: -2)),
        ]),
      ),
    );
  }

  // ── Overlay error ───────────────────────────────────────────
  Widget _buildErrorOverlay(MarcajeProvider provider) {
    return Container(
      color: Colors.white.withOpacity(0.96),
      child: Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(
            width: 100, height: 100,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.red.shade50,
              border: Border.all(color: Colors.red, width: 2),
            ),
            child: const Icon(Icons.close_rounded, size: 56, color: Colors.red),
          ),
          const SizedBox(height: 24),
          Text(provider.errorMsg ?? 'Error desconocido',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
            textAlign: TextAlign.center),
        ]),
      ),
    );
  }
}

// Extensión para QR
extension on MarcajeProvider {
  Future<void> buscarEmpleadoQR(String qrToken) async {
    state = AppState.buscando;
    notifyListeners();
    try {
      final res = await http.post(
        Uri.parse('https://door-logistics.onrender.com/api/asistencia/buscar-empleado'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'qrToken': qrToken}),
      );
      final data = jsonDecode(res.body);
      if (data['success'] == true) {
        empleado = EmpleadoInfo(
          id: data['empleado']['id'],
          nombre: data['empleado']['nombre'],
          cargo: data['empleado']['cargo'],
          departamento: data['empleado']['departamento'],
          numeroId: data['empleado']['numeroId'],
          siguienteMarcaje: data['siguienteMarcaje'],
          bloqueado: data['bloqueado'] ?? false,
          minutosRestantes: data['minutosRestantes'] ?? 0,
        );
        await marcarQR(qrToken);
      } else {
        errorMsg = data['message'] ?? 'QR no reconocido';
        state = AppState.error;
        notifyListeners();
        Future.delayed(const Duration(seconds: 3), reset);
      }
    } catch (e) {
      errorMsg = 'Error de conexión';
      state = AppState.error;
      notifyListeners();
      Future.delayed(const Duration(seconds: 3), reset);
    }
  }
}