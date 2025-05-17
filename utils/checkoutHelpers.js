import { expect } from '@playwright/test';

async function addProductsToCart(page, productUrls) {
  for (const url of productUrls) {
    await page.goto(url);
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await page.waitForTimeout(1000); // Slight delay between additions
  }
  // Go to cart after adding products
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

async function fillShippingDetails(page, data) {
  await expect(page.locator('input#customer-email')).toBeVisible({ timeout: 10000 });

  await page.fill('input#customer-email', data.email);
  await page.fill('input[name="firstname"]', data.firstname);
  await page.fill('input[name="lastname"]', data.lastname);
  await page.fill('input[name="company"]', data.company);
  await page.fill('input[name="street[0]"]', data.street1);
  await page.fill('input[name="street[1]"]', data.street2);
  await page.selectOption('select[name="country_id"]', data.country);
  await page.fill('input[name="city"]', data.city);
  await page.fill('input[name="postcode"]', data.postcode);
  await page.fill('input[name="telephone"]', data.telephone);

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

/**
 * Fills redirect payment details and handles 3DS choice
 * @param {import('@playwright/test').Page} page 
 * @param {Object} card 
 * @param {'yes' | 'no'} [choice='yes'] - Which 3DS button to click
 */

async function fillRedirectPaymentDetails(page, card, choice = 'yes') {
  const expMonth = card.exp.slice(0, 2);
  const expYear = '20' + card.exp.slice(2);

  await expect(page.locator('#select2-brandTypeSelect-container')).toBeVisible({ timeout: 20000 });
  await page.locator('#select2-brandTypeSelect-container').click();
  await expect(page.locator('.select2-results__option', { hasText: 'VISA' })).toBeVisible();
  await page.locator('.select2-results__option', { hasText: 'VISA' }).click();

  await page.locator('#cardNumber').fill(card.number);
  await page.locator('#expiryMonth').selectOption(expMonth);
  await page.locator('#expiryYear').selectOption(expYear);
  await page.locator('#cardCode_masked').type(card.cvv);
  await page.click('#nextBtn');
  console.log('Submitted card details');

  // 🔐 Handle 3DS authentication
  await handle3DSChallenge(page, choice);

  // Wait for either success or error message
  await Promise.race([
  page.locator('[data-ui-id="message-success"]').waitFor({ timeout: 25000 }),
  page.locator('[data-ui-id="checkout-cart-validationmessages-message-error"]').waitFor({ timeout: 25000 })
]);

// Then check which one appeared
if (await page.locator('[data-ui-id="message-success"]').isVisible()) {
  await verifyOrderSuccessMessage(page);
} else if (await page.locator('[data-ui-id="checkout-cart-validationmessages-message-error"]').isVisible()) {
  await verifyPaymentFailureMessage(page);
} else {
  throw new Error('Neither success nor failure message appeared.');
}
}

// Reusable function to verify order success message
async function verifyOrderSuccessMessage(page) {
  const messageLocator = page.locator('[data-ui-id="message-success"] >> text=Your order number with');

  // Wait for the element and check if it contains the expected text
  await expect(messageLocator).toContainText('Your order number with');

  const fullMessage = await messageLocator.textContent();
  expect(fullMessage).toMatch(/Your order number with \d+ is successful/);

  console.log('Order success message verified:', fullMessage);
}

async function verifyPaymentFailureMessage(page) {
  const errorLocator = page.locator('[data-ui-id="checkout-cart-validationmessages-message-error"]');

  // Wait for the error message to appear (up to 10 seconds)
  await errorLocator.waitFor({ timeout: 10000 });

  // Check that it contains the expected failure text
  await expect(errorLocator).toContainText('Declined: Your bank has declined the payment');

  const errorMessage = await errorLocator.textContent();
  console.log('Payment failure message verified:', errorMessage);
}

async function handle3DSChallenge(page, choice = 'yes') {
  const iframeSelector = 'iframe[src*="modirum"]';
  const buttonSelector = `button#${choice}`;

  const iframeElement = await page.locator(iframeSelector).elementHandle({ timeout: 10000 }).catch(() => null);
  if (iframeElement) {
    console.log(`🔐 3DS iframe detected, attempting "${choice}" inside iframe...`);
    try {
      const frame = page.frameLocator(iframeSelector);
      await frame.locator(buttonSelector).waitFor({ timeout: 5000 });
      await frame.locator(buttonSelector).click();
      console.log(`✅ Clicked "${choice}" inside iframe`);
      return;
    } catch (e) {
      console.warn(`⚠️ Failed to click "${choice}" in iframe:`, e.message);
    }
  } else {
    console.log('ℹ️ 3DS iframe not detected, checking main page...');
  }

  const fallbackButton = await page.locator(buttonSelector).elementHandle({ timeout: 5000 }).catch(() => null);
  if (fallbackButton) {
    try {
      await page.locator(buttonSelector).click();
      console.log(`✅ Clicked "${choice}" on main page`);
    } catch (e) {
      console.error(`❌ Failed to click "${choice}" on main page:`, e.message);
      throw e;
    }
  } else {
    console.log('ℹ️ No 3DS challenge detected, continuing...');
  }
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
  addProductsToCart,
  proceedToCheckout,
  fillShippingDetails,
  selectLloydsCardnetPaymentJs,
  selectLloydsCardnetConnect,
  fillPaymentDetails,
  validatePaymentFields,
  fillRedirectPaymentDetails
};
