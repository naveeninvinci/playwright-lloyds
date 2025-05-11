import { expect } from '@playwright/test';

async function navigateToProductAndAddToCart(page) {
  await page.goto('https://lloyds-m2.autify-payments.com/crown-summit-backpack.html');
  await page.getByRole('button', { name: 'Add to Cart' }).click();
  await page.getByRole('link', { name: 'shopping cart' }).click();
  await page.waitForSelector('button[data-role="proceed-to-checkout"]', { timeout: 10000 });
}

async function proceedToCheckout(page) {
  const checkoutBtn = page.locator('button[data-role="proceed-to-checkout"]');
  await checkoutBtn.scrollIntoViewIfNeeded();
  await expect(checkoutBtn).toBeVisible({ timeout: 10000 });
  await expect(checkoutBtn).toBeEnabled({ timeout: 10000 });

  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
      checkoutBtn.click({ timeout: 5000 }),
    ]);
  } catch (e) {
    console.warn('Standard click failed. Trying JS click...');
    const handle = await checkoutBtn.elementHandle();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
      page.evaluate(el => el && el.click(), handle),
    ]);
  }

  await expect(page).toHaveURL(/checkout\/.*/, { timeout: 15000 });
}

async function fillShippingDetails(page) {
  await expect(page.locator('input#customer-email')).toBeVisible({ timeout: 10000 });
  await page.fill('input#customer-email', 'naveen@autify.net');
  await page.fill('input[name="firstname"]', 'Test');
  await page.fill('input[name="lastname"]', 'Data');
  await page.fill('input[name="company"]', 'Autify');
  await page.fill('input[name="street[0]"]', 'B901');
  await page.fill('input[name="street[1]"]', 'Broad street');
  await page.selectOption('select[name="country_id"]', 'GB');
  await page.fill('input[name="city"]', 'Nottingham');
  await page.fill('input[name="postcode"]', 'NG1 3AP');
  await page.fill('input[name="telephone"]', '07765465422');

  const shippingMethod = page.locator('input[type="radio"][name="ko_unique_4"]');
  await expect(shippingMethod.first()).toBeVisible({ timeout: 10000 });
  await shippingMethod.first().check();
  await page.locator('button[data-role="opc-continue"]').click();
}

async function selectLloydsCardnetPaymentJs(page) {
  const label = page.locator('label[for="lcnetpaymentjs"]');
  await expect(label).toBeVisible({ timeout: 5000 });
  await label.click();
}

async function selectLloydsCardnetConnect(page) {
  const label = page.locator('label[for="lcnetredirect"]');
  await expect(label).toBeVisible({ timeout: 5000 });
  await label.click();
}

async function fillPaymentDetails(page, card) {
  await expect(page.frameLocator('#first-data-payment-field-name').locator('input#name')).toBeVisible({ timeout: 10000 });
  await page.frameLocator('#first-data-payment-field-name').locator('input#name').fill(card.name);
  await page.frameLocator('#first-data-payment-field-card').locator('input#card').fill(card.number);
  await page.frameLocator('#first-data-payment-field-exp').locator('input#exp').fill(card.exp);
  await page.frameLocator('#first-data-payment-field-cvv').locator('input').fill(card.cvv);
  await page.frameLocator('#first-data-payment-field-cvv').locator('input').press('Tab');
}

async function fillRedirectPaymentDetails(page, card) {
  const expMonth = card.exp.slice(0, 2);
  const expYear = '20' + card.exp.slice(2);

  await expect(page.locator('#select2-brandTypeSelect-container')).toBeVisible({ timeout: 20000 });
  await page.locator('#select2-brandTypeSelect-container').click();
  await expect(page.locator('.select2-results__option', { hasText: 'VISA' })).toBeVisible();
  await page.locator('.select2-results__option', { hasText: 'VISA' }).click();

  await page.locator('#cardNumber').fill(card.number);
  await page.locator('#expiryMonth').selectOption(expMonth);
  await page.locator('#expiryYear').selectOption(expYear);
  await page.locator('#cardCode_masked').fill(card.cvv);
}

async function validatePaymentFields(page) {
  const nameClass = await page.locator('#cc-name').getAttribute('class');
  const cardClass = await page.locator('#cc-card').getAttribute('class');
  const expClass = await page.locator('#cc-exp').getAttribute('class');
  const cvvClass = await page.locator('#cc-cvv').getAttribute('class');

  console.log('Validation Status:');
  console.log('Name:', nameClass, '| Card:', cardClass, '| Exp:', expClass, '| CVV:', cvvClass);

  return [nameClass, cardClass, expClass, cvvClass].every(cls => cls?.includes('valid'));
}

export {
  navigateToProductAndAddToCart,
  proceedToCheckout,
  fillShippingDetails,
  selectLloydsCardnetPaymentJs,
  selectLloydsCardnetConnect,
  fillPaymentDetails,
  validatePaymentFields,
  fillRedirectPaymentDetails
};
