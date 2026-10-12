// Login helper genérico para Playwright, reusable en las 3 apps.
// Funciona por selectores de tipo (input[type=email/password], button[type=submit])
// en vez de ids, porque plataforma-web usa #login-email/#login-password pero
// editor y visor no ponen id en sus inputs — el selector por type es el único
// que pega en las 3.
//
// Pega contra el backend configurado en la app (por defecto producción,
// notry-back.vercel.app). Ver memoria "reference_test_credentials" para
// las cuentas de testeo — NO usar la cuenta real del usuario acá.

const DEFAULT_TIMEOUT = 15_000;

export async function login(page, { email, password, timeout = DEFAULT_TIMEOUT } = {}) {
  if (!email || !password) {
    throw new Error('login() necesita { email, password }');
  }

  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitBtn = page.locator('button[type="submit"]').first();

  await emailInput.waitFor({ state: 'visible', timeout });
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await submitBtn.click();

  // El form de login desmonta (navegación o cambio de vista) al loguear OK.
  await emailInput.waitFor({ state: 'detached', timeout }).catch(() => {
    throw new Error('Login no completó: el form de login sigue visible (¿credenciales inválidas?)');
  });
}
