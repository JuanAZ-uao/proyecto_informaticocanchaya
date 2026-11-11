// US-23: CORS_ORIGIN admite varios orígenes (producción y staging) y un comodín seguro para las previews de Vercel.
function cargar(corsOrigin, nodeEnv = 'production') {
  jest.resetModules();
  jest.doMock('../src/config/env', () => ({ nodeEnv, corsOrigin }));
  return require('../src/config/corsOrigin').origenPermitido;
}

describe('CORS_ORIGIN con varios orígenes', () => {
  it('permite cada origen de la lista y rechaza el resto', () => {
    const permitido = cargar('https://canchaya.vercel.app, https://canchaya-staging.vercel.app/');

    expect(permitido('https://canchaya.vercel.app')).toBe(true);
    expect(permitido('https://canchaya-staging.vercel.app')).toBe(true);
    expect(permitido('https://otro.vercel.app')).toBe(false);
    expect(permitido('http://canchaya.vercel.app')).toBe(false);
  });

  it('el comodín cubre las previews del propio proyecto y nada más', () => {
    const permitido = cargar('https://canchaya-*.vercel.app');

    expect(permitido('https://canchaya-git-us-30-equipo.vercel.app')).toBe(true);
    expect(permitido('https://canchaya-abc123.vercel.app')).toBe(true);
    expect(permitido('https://canchaya.vercel.app')).toBe(false);
    expect(permitido('https://canchaya-x.vercel.app.sitio-malicioso.com')).toBe(false);
    expect(permitido('https://canchaya-x.evil.com/.vercel.app')).toBe(false);
    expect(permitido('https://malicioso-canchaya-x.vercel.app')).toBe(false);
  });

  it.each(['*', 'https://*', 'https://*.vercel.app', 'canchaya-*.vercel.app', 'https://canchaya-*', ''])(
    'ignora el patrón demasiado amplio o inválido "%s"',
    (patron) => {
      const permitido = cargar(patron);

      expect(permitido('https://cualquier-sitio.com')).toBe(false);
      expect(permitido('https://canchaya-abc.vercel.app')).toBe(false);
    }
  );

  it('sin CORS_ORIGIN solo se aceptan peticiones sin origen', () => {
    const permitido = cargar(undefined);

    expect(permitido(undefined)).toBe(true);
    expect(permitido('https://canchaya.vercel.app')).toBe(false);
  });

  it('fuera de producción sigue aceptando localhost, y en producción no', () => {
    expect(cargar('https://canchaya.vercel.app', 'development')('http://localhost:5173')).toBe(true);
    expect(cargar('https://canchaya.vercel.app', 'production')('http://localhost:5173')).toBe(false);
  });
});
