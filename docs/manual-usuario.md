# Manual de usuario — CanchaYa

**Versión:** Sprint 5  
**Aplicación:** CanchaYa, reserva de canchas sintéticas  
**Dirección local con Docker:** `http://localhost:8080`

## 1. Ingresar o crear una cuenta

La aplicación requiere una cuenta para consultar el catálogo y reservar.

1. Abre la aplicación y selecciona **Regístrate gratis** o entra a `/registro`.
2. Escribe nombre completo, correo electrónico, teléfono y contraseña.
3. La contraseña debe tener al menos 8 caracteres, una letra y un número.
4. Selecciona **Registrarme**. Cuando aparezca la confirmación, inicia sesión con tu correo y contraseña.

Si ya tienes una cuenta, selecciona **Inicia sesión** o entra a `/login`. Al ingresar correctamente, CanchaYa abre el catálogo. Si una contraseña no funciona, usa **¿La olvidaste?** en la pantalla de acceso, solicita el enlace y sigue las indicaciones recibidas.

## 2. Buscar una cancha y reservar

1. En **Canchas**, explora el catálogo y abre la ficha de la cancha que te interesa.
2. Elige una fecha. La pantalla presenta las franjas de una hora que están dentro del horario de atención.
3. Selecciona una franja disponible y pulsa **Iniciar reserva**. El sistema la aparta temporalmente mientras completas la operación; el contador tiene una duración de 3 minutos.
4. Revisa el resumen de cancha, fecha, horario y precio. Elige una tarjeta guardada para pagar en línea o conserva la opción de pagar en la cancha.
5. Pulsa **Confirmar reserva**. Guarda el código `CY-XXXXXXXX` que aparece en la confirmación; también podrás consultarlo en **Mis reservas**.

Los estados de disponibilidad se actualizan en tiempo real. Una franja ocupada o apartada por otra persona no se puede seleccionar. Si cambias de opinión antes de confirmar, pulsa **Cancelar y liberar la franja**. Si el contador termina, selecciona otra franja e inicia nuevamente.

## 3. Consultar y cancelar reservas

En **Mis reservas** puedes revisar el código, la cancha, la fecha, el horario y el estado de tus reservas.

- Una reserva confirmada se puede cancelar desde **Cancelar reserva** y confirmar la acción en el diálogo.
- La cancelación propia debe hacerse con al menos 2 horas de anticipación al inicio. Si ya pasó el límite, la aplicación informa que no es posible cancelarla.
- Si la reserva se pagó con tarjeta y la pasarela aprobó el pago, la operación de cancelación solicita el reembolso. La aplicación muestra el resultado.
- La franja liberada vuelve a aparecer disponible para otras personas.

## 4. Actualizar el perfil y las tarjetas

Abre **Mi perfil** desde la navegación para actualizar tus datos personales o cambiar la contraseña. Para cambiar el correo, escribe la nueva dirección y abre el enlace de verificación enviado a esa dirección. El correo de la cuenta cambia después de completar la verificación.

En **Métodos de pago** puedes guardar o eliminar tarjetas. La aplicación muestra la marca y los últimos cuatro dígitos; no muestra el número completo ni el CVV. Por seguridad, agregar una tarjeta requiere una conexión HTTPS.

### Entorno de demostración de pagos

La configuración inicial usa una pasarela simulada. No procesa cargos reales. Para probar los resultados, usa únicamente estos números de demostración:

| Número de prueba | Resultado simulado |
|---|---|
| `4242 4242 4242 4242` | Pago aprobado |
| `4000 0000 0000 0002` | Pago rechazado por el banco |
| `4000 0000 0000 9995` | Fondos insuficientes |

No escribas datos de una tarjeta real en el entorno de demostración.

## 5. Funciones para administradores

El menú **Administración** solo aparece para cuentas con rol de administrador.

### Verificar el código de una reserva

1. Abre **Administración** y escribe el código `CY-XXXXXXXX` que presenta el usuario.
2. Selecciona **Verificar**. La pantalla indica si la reserva está vigente o, si no, si venció, fue cancelada o ya se utilizó.
3. Si está vigente y el usuario ya usó la cancha, selecciona **Marcar como utilizada**. La acción queda registrada en la tabla de verificaciones.

Un código inexistente o mal escrito aparece como **Código no encontrado**. Revisa los caracteres con el usuario.

### Cancelar una reserva como administrador

En **Cancelar reservas**, filtra las reservas futuras, abre la acción de cancelación y escribe un motivo. Revisa los datos antes de confirmar: el sistema notifica al usuario y registra la operación. Se aplican las restricciones horarias del sistema.

### Gestionar las canchas del catálogo

En **Gestionar canchas** (menú de administración) ves todas las canchas, también las desactivadas, con su precio y cuántas reservas futuras tienen.

- **Nueva cancha:** pulsa **Nueva cancha**, completa nombre, dirección, precio por hora y el horario de atención (marca los días en que abre y su hora de apertura y cierre) y pulsa **Crear cancha**. La cancha aparece de inmediato en el catálogo. El precio debe ser mayor que 0 y la hora de cierre posterior a la de apertura; los errores se muestran junto a cada campo.
- **Editar:** pulsa **Editar**, cambia los datos y pulsa **Guardar cambios**. El catálogo muestra los cambios al instante; las reservas ya confirmadas no se modifican.
- **Desactivar:** pulsa **Desactivar** y confirma. La cancha deja de mostrarse en el catálogo y no admite nuevas reservas, pero su historial se conserva. Si tiene reservas futuras, el sistema te muestra cuáles son y exige una confirmación explícita (**Sí, desactivar de todos modos**); esas reservas se conservan.
- **Activar:** en una cancha desactivada, pulsa **Activar** para volver a mostrarla y admitir reservas.

Un usuario sin rol de administrador no ve estas opciones y, si intenta abrir la ruta, vuelve al catálogo.

## 6. Ayuda y problemas comunes

| Situación | Qué hacer |
|---|---|
| No puedes abrir una ruta protegida | Inicia sesión de nuevo y vuelve al catálogo. |
| Una franja desaparece o aparece ocupada | Actualiza la fecha o el detalle de la cancha y elige otra franja libre. |
| Se agotó el contador de reserva | Inicia una nueva selección; la franja anterior se libera automáticamente. |
| No llega el enlace de recuperación o de cambio de correo | Revisa la carpeta de correo no deseado. En la instalación de desarrollo sin SMTP, el enlace queda en el registro del servidor y debe entregarlo quien administra ese entorno. |
| No puedes agregar una tarjeta | Usa HTTPS y verifica que los datos de prueba cumplan las validaciones. |
| No aparece el menú Administración | Solicita al responsable del sistema que habilite el rol administrador para tu cuenta. |

## 7. Accesibilidad y dispositivos

La interfaz se puede usar en pantallas móviles y de escritorio. Los formularios muestran errores junto a los campos cuando es posible, y los diálogos de confirmación permiten cancelar o continuar la acción antes de ejecutarla.
