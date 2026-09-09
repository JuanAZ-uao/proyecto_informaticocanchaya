// Política mínima de contraseña (RNF-03): al menos 8 caracteres, una letra y un número.
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function cumplePoliticaMinima(password) {
  return typeof password === 'string' && PASSWORD_REGEX.test(password);
}

module.exports = { cumplePoliticaMinima, PASSWORD_REGEX };
