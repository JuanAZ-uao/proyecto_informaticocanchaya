// US-14 y US-27: correos de cancelación y de verificación de correo. Sin enviar nada de verdad.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/sin_uso';

const reserva = {
  codigo: 'CY-AAAA1111',
  fecha: '2099-12-31',
  horaInicio: '10:00:00',
  horaFin: '11:00:00',
  cancha: { nombre: 'Cancha El Bosque', direccion: 'Calle 1 # 2-3' },
};

function cargarServicio({ conSmtp }) {
  jest.resetModules();
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'x' });
  jest.doMock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail })) }));

  ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].forEach((clave) => {
    if (conSmtp) process.env[clave] = 'valor';
    else delete process.env[clave];
  });

  return { servicio: require('../src/services/emailService'), sendMail };
}

describe('sin SMTP configurado (modo desarrollo)', () => {
  let registro;

  beforeEach(() => {
    registro = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => registro.mockRestore());

  it('la cancelación solo se imprime en el log, sin saltos de línea inyectados', async () => {
    const { servicio, sendMail } = cargarServicio({ conSmtp: false });

    const resultado = await servicio.enviarCorreoCancelacionReserva({
      para: 'ana@correo.com\nFALSO: línea inyectada',
      nombre: 'Ana',
      reserva: { ...reserva, cancha: { ...reserva.cancha, nombre: 'Cancha\nInyectada' } },
      reembolso: null,
    });

    expect(resultado).toEqual({ simulado: true });
    expect(sendMail).not.toHaveBeenCalled();
    const linea = registro.mock.calls[0][0];
    expect(linea).toContain('CY-AAAA1111');
    expect(linea).not.toContain('\n');
  });

  it('el enlace de verificación se imprime para poder probar el flujo', async () => {
    const { servicio } = cargarServicio({ conSmtp: false });

    const resultado = await servicio.enviarCorreoVerificacionCorreo({ para: 'nueva@correo.com', nombre: 'Ana', enlaceVerificacion: 'http://localhost:5173/verificar-correo?token=abc' });

    expect(resultado).toEqual({ simulado: true });
    expect(registro.mock.calls.map((c) => c[0]).join(' ')).toContain('http://localhost:5173/verificar-correo?token=abc');
  });
});

describe('con SMTP configurado', () => {
  it('el correo de cancelación lleva el detalle de la reserva y el reembolso', async () => {
    const { servicio, sendMail } = cargarServicio({ conSmtp: true });

    await servicio.enviarCorreoCancelacionReserva({
      para: 'ana@correo.com',
      nombre: 'Ana',
      reserva,
      reembolso: { monto: 60000, moneda: 'COP', marca: 'Visa', ultimos4: '4242' },
    });

    const { to, subject, html } = sendMail.mock.calls[0][0];
    expect(to).toBe('ana@correo.com');
    expect(subject).toBe('CanchaYa - Reserva cancelada CY-AAAA1111');
    expect(html).toContain('Cancha El Bosque');
    expect(html).toContain('2099-12-31');
    expect(html).toContain('10:00 - 11:00');
    expect(html).toContain('cancelada');
    expect(html).toContain('Se reembolsó');
    expect(html).toContain('60.000 COP');
    expect(html).toContain('Visa terminada en 4242');
  });

  it('sin pago no menciona ningún reembolso', async () => {
    const { servicio, sendMail } = cargarServicio({ conSmtp: true });

    await servicio.enviarCorreoCancelacionReserva({ para: 'ana@correo.com', nombre: 'Ana', reserva, reembolso: null });

    expect(sendMail.mock.calls[0][0].html).not.toContain('reembolsó');
  });

  it('escapa el HTML de los datos del usuario para que no pueda inyectar etiquetas', async () => {
    const { servicio, sendMail } = cargarServicio({ conSmtp: true });

    await servicio.enviarCorreoCancelacionReserva({
      para: 'ana@correo.com',
      nombre: '<script>alert(1)</script>',
      reserva: { ...reserva, cancha: { nombre: '<img src=x onerror=alert(2)>', direccion: 'Calle "1" & \'2\'' } },
      reembolso: null,
    });

    const { html } = sendMail.mock.calls[0][0];
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Calle &quot;1&quot; &amp; &#39;2&#39;');
  });

  it('el correo de verificación se envía al correo nuevo con el enlace escapado', async () => {
    const { servicio, sendMail } = cargarServicio({ conSmtp: true });

    await servicio.enviarCorreoVerificacionCorreo({ para: 'nueva@correo.com', nombre: 'Ana', enlaceVerificacion: 'http://x.co/verificar-correo?token=a&b="c"' });

    const { to, subject, html } = sendMail.mock.calls[0][0];
    expect(to).toBe('nueva@correo.com');
    expect(subject).toBe('CanchaYa - Confirma tu nuevo correo');
    expect(html).toContain('token=a&amp;b=&quot;c&quot;');
    expect(html).toContain('ignora este correo');
  });
});

describe('sin SMTP en producción (US-22: los logs no llevan tokens ni datos personales)', () => {
  let registro;

  beforeEach(() => {
    registro = jest.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.LOG_CORREO_DETALLE;
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    registro.mockRestore();
    process.env.NODE_ENV = 'test';
    delete process.env.LOG_CORREO_DETALLE;
  });

  it('no imprime el enlace con el token ni el correo del destinatario', async () => {
    const { servicio, sendMail } = cargarServicio({ conSmtp: false });

    const recuperacion = await servicio.enviarCorreoRecuperacion({ para: 'ana@correo.com', enlaceRestablecimiento: 'https://canchaya.app/restablecer?token=SECRETO' });
    const verificacion = await servicio.enviarCorreoVerificacionCorreo({ para: 'nueva@correo.com', nombre: 'Ana', enlaceVerificacion: 'https://canchaya.app/verificar-correo?token=SECRETO2' });
    const confirmacion = await servicio.enviarCorreoConfirmacionReserva({ para: 'ana@correo.com', nombre: 'Ana', reserva });

    expect([recuperacion, verificacion, confirmacion]).toEqual([{ simulado: true }, { simulado: true }, { simulado: true }]);
    expect(sendMail).not.toHaveBeenCalled();
    const texto = registro.mock.calls.map((c) => c[0]).join(' ');
    expect(texto).toContain('SMTP no configurado');
    expect(texto).not.toMatch(/SECRETO|ana@correo|nueva@correo|token=/);
  });

  it('LOG_CORREO_DETALLE=true lo reactiva de forma explícita (por ejemplo, el entorno Docker local)', async () => {
    process.env.LOG_CORREO_DETALLE = 'true';
    const { servicio } = cargarServicio({ conSmtp: false });

    await servicio.enviarCorreoVerificacionCorreo({ para: 'nueva@correo.com', nombre: 'Ana', enlaceVerificacion: 'https://canchaya.app/verificar-correo?token=abc' });

    expect(registro.mock.calls.map((c) => c[0]).join(' ')).toContain('token=abc');
  });
});
