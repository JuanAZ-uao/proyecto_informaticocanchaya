import { useState } from 'react';
import { marcarReservaUsada, verificarCodigoReserva } from '../../api/adminApi';
import extraerMensajeError from '../../api/extraerMensajeError';
import { formatearFechaLarga } from '../../utils/formato';
import Alerta from '../common/Alerta';
import Icono from '../common/Icono';

const MOTIVOS = { vencida: 'La reserva venció', cancelada: 'La reserva fue cancelada', usada: 'La reserva ya fue utilizada' };

// US-29: el administrador escribe el código que muestra el usuario y ve si la reserva está vigente.
export default function VerificadorCodigo({ onActividad }) {
  const [codigo, setCodigo] = useState('');
  const [resultado, setResultado] = useState(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [marcando, setMarcando] = useState(false);

  function limpiar() {
    setResultado(null);
    setNoEncontrado(false);
    setError('');
    setMensaje('');
  }

  async function verificar(evento) {
    evento.preventDefault();
    limpiar();
    setVerificando(true);

    try {
      const { data } = await verificarCodigoReserva(codigo);
      setResultado(data);
    } catch (err) {
      // Un código mal escrito o inexistente recibe siempre la misma respuesta (404): "Código no encontrado".
      if (err.response?.status === 404) setNoEncontrado(true);
      else setError(extraerMensajeError(err, 'No fue posible verificar el código'));
    } finally {
      setVerificando(false);
      onActividad();
    }
  }

  async function marcarUsada() {
    setMarcando(true);
    setError('');

    try {
      const { data } = await marcarReservaUsada(resultado.reserva.codigo);
      setResultado(data);
      setMensaje('Reserva marcada como utilizada. Este código ya no puede validarse como vigente.');
    } catch (err) {
      setError(extraerMensajeError(err, 'No fue posible marcar la reserva como utilizada'));
    } finally {
      setMarcando(false);
      onActividad();
    }
  }

  const vigente = resultado?.estado === 'vigente';

  return (
    <section className="admin-seccion" aria-labelledby="titulo-verificar">
      <h2 id="titulo-verificar" className="perfil-seccion-titulo">
        <Icono nombre="escudo" tamano={20} /> Verificar código de reserva
      </h2>
      <p className="texto-ayuda">Ingresa el código que te muestra el usuario (por ejemplo, CY-1A2B3C4D) para confirmar si su reserva está vigente.</p>

      <form className="admin-formulario" onSubmit={verificar}>
        <div className="campo">
          <label htmlFor="codigo-reserva">Código de reserva</label>
          <input id="codigo-reserva" type="text" autoComplete="off" autoCapitalize="characters" spellCheck="false" placeholder="CY-XXXXXXXX" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        </div>
        <button type="submit" className="boton-acento" disabled={verificando || !codigo.trim()}>
          {verificando ? 'Verificando...' : 'Verificar'}
        </button>
      </form>

      <Alerta mensaje={error} />
      <Alerta tipo="exito" mensaje={mensaje} />

      {noEncontrado && (
        <div className="resultado-codigo resultado-no-encontrado" role="status">
          <strong className="resultado-codigo-estado">Código no encontrado</strong>
          <p>Revisa que esté bien escrito. No hay una reserva con ese código.</p>
        </div>
      )}

      {resultado && (
        <div className={`resultado-codigo ${vigente ? 'resultado-vigente' : 'resultado-no-vigente'}`} role="status">
          <strong className="resultado-codigo-estado">{vigente ? 'Vigente' : 'No vigente'}</strong>
          {!vigente && <p className="resultado-motivo">Motivo: {resultado.motivo} · {MOTIVOS[resultado.motivo]}</p>}

          <dl className="resumen-lista">
            <div>
              <dt>Código</dt>
              <dd>{resultado.reserva.codigo}</dd>
            </div>
            <div>
              <dt>Cancha</dt>
              <dd>{resultado.reserva.cancha.nombre}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>{formatearFechaLarga(resultado.reserva.fecha)}</dd>
            </div>
            <div>
              <dt>Horario</dt>
              <dd>
                {resultado.reserva.horaInicio} - {resultado.reserva.horaFin}
              </dd>
            </div>
            <div>
              <dt>Usuario</dt>
              <dd>{resultado.reserva.usuario.nombre}</dd>
            </div>
          </dl>

          {vigente && (
            <button type="button" className="boton-primario" onClick={marcarUsada} disabled={marcando}>
              {marcando ? 'Marcando...' : 'Marcar como utilizada'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
