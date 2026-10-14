jest.mock('../src/config/env', () => ({ nodeEnv: 'production', corsOrigin: 'http://localhost:8080' }));

const verificarOrigen = require('../src/config/corsOrigin');
const { origenPermitido, rechazarOrigenNoPermitido } = verificarOrigen;

function respuesta() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

describe('corsOrigin (DEF-08)', () => {
  it('permite el origen configurado y las peticiones sin origen (curl, servidor a servidor)', () => {
    expect(origenPermitido('http://localhost:8080')).toBe(true);
    expect(origenPermitido(undefined)).toBe(true);
  });

  it('en producción rechaza otros orígenes, incluso localhost con otro puerto', () => {
    expect(origenPermitido('http://sitio-malicioso.example')).toBe(false);
    expect(origenPermitido('http://localhost:5173')).toBe(false);
  });

  it('verificarOrigen no genera un error: un origen ajeno simplemente no recibe cabeceras CORS', () => {
    const callback = jest.fn();
    verificarOrigen('http://sitio-malicioso.example', callback);
    expect(callback).toHaveBeenCalledWith(null, false);
  });

  it('el middleware responde 403 "Origen no permitido" (y no un error 500) a un origen ajeno', () => {
    const res = respuesta();
    const next = jest.fn();

    rechazarOrigenNoPermitido({ headers: { origin: 'http://sitio-malicioso.example' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Origen no permitido' });
    expect(next).not.toHaveBeenCalled();
  });

  it('el middleware deja pasar los orígenes permitidos', () => {
    const next = jest.fn();
    rechazarOrigenNoPermitido({ headers: { origin: 'http://localhost:8080' } }, respuesta(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('corsOrigin: llamadas desde el mismo origen (Swagger UI)', () => {
  it('deja pasar a una página servida por la propia API aunque no sea el origen del frontend', () => {
    const next = jest.fn();
    const req = { headers: { origin: 'http://localhost:4100', host: 'localhost:4100' } };
    rechazarOrigenNoPermitido(req, respuesta(), next);
    expect(next).toHaveBeenCalled();
  });

  it('sigue rechazando un origen ajeno aunque el Host sea el de la API', () => {
    const res = respuesta();
    const next = jest.fn();
    rechazarOrigenNoPermitido({ headers: { origin: 'http://sitio-malicioso.example', host: 'localhost:4100' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
