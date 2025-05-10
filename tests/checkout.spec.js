import { test, expect } from '@playwright/test';

test('Checkout and Payment Flow - Multiple Cards', async ({ page }) => {
  // Navigate to the product page
  await page.goto('https://lloyds-m2.autify-payments.com/crown-summit-backpack.html');

  // Add the item to the cart
  await page.getByRole('button', { name: 'Add to Cart' }).click();

  // Navigate to the shopping cart
  await page.getByRole('link', { name: 'shopping cart' }).click();

  // Manual wait for animation/JS bindings to settle
await page.waitForTimeout(1000);

// Scroll into view
const checkoutBtn = page.locator('button[data-role="proceed-to-checkout"]');
await checkoutBtn.scrollIntoViewIfNeeded();

// Ensure it's visible and enabled
await expect(checkoutBtn).toBeVisible({ timeout: 10000 });
await expect(checkoutBtn).toBeEnabled({ timeout: 10000 });

try {
  // Try a standard Playwright click
  await checkoutBtn.click({ timeout: 5000 });
} catch (e) {
  console.warn('Standard click failed. Trying JS click as fallback...');
  // Use DOM click as a last resort
  const elementHandle = await checkoutBtn.elementHandle();
  await page.evaluate(el => el.click(), elementHandle);
}


  // Fill out the checkout form
  await page.locator('input#customer-email').fill('naveen@autify.net');
  await page.locator('input[name="firstname"]').fill('Test');
  await page.locator('input[name="lastname"]').fill('Data');
  await page.locator('input[name="company"]').fill('Autify');
  await page.locator('input[name="street[0]"]').fill('B901');
  await page.locator('input[name="street[1]"]').fill('Broad street');
  await page.locator('select[name="country_id"]').selectOption('GB');
  await page.locator('input[name="city"]').fill('Nottingham');
  await page.locator('input[name="postcode"]').fill('NG1 3AP');
  await page.locator('input[name="telephone"]').fill('07765465422');

  // Select the shipping method
  await page.locator('input[type="radio"][name="ko_unique_4"]').first().check();
  await page.locator('button[data-role="opc-continue"]').click();

  // Click the payment method container or its label
  // Wait for DOM to render
await page.waitForTimeout(2000);

// Click the label for the lcnet payment method
const lcnetLabel = page.locator('label[for="lcnetpaymentjs"]');
await lcnetLabel.waitFor({ state: 'visible', timeout: 5000 });
await lcnetLabel.click();



  // Fill in the payment iframes
  await page.frameLocator('#first-data-payment-field-name').locator('input#name').fill('Naveen');
  await page.frameLocator('#first-data-payment-field-card').locator('input#card').fill('4147463011110083');
  await page.frameLocator('#first-data-payment-field-exp').locator('input#exp').fill('0829');
  await page.waitForTimeout(500);
  await page.frameLocator('#first-data-payment-field-cvv').locator('input').fill('123');
await page.frameLocator('#first-data-payment-field-cvv').locator('input').press('Tab');
await page.waitForTimeout(500); // let vali

  // Log validation classes
const nameClass = await page.locator('#cc-name').getAttribute('class');
const cardClass = await page.locator('#cc-card').getAttribute('class');
const expClass = await page.locator('#cc-exp').getAttribute('class');
const cvvClass = await page.locator('#cc-cvv').getAttribute('class');

console.log('Validation Status:');
console.log('Name Field:', nameClass);
console.log('Card Field:', cardClass);
console.log('Expiry Field:', expClass);
console.log('CVV Field:', cvvClass);

// Optionally check if all are valid before clicking
const allValid = [nameClass, cardClass, expClass, cvvClass].every(cls => cls?.includes('valid'));
if (allValid) {
  console.log('✅ All payment fields are valid. Placing order...');
  await page.locator('button:has-text("Place Order"):not([disabled])').first().click();
} else {
  console.warn('❌ Some fields are still invalid. Skipping order placement.');
}



  // Verify the success message
  const message = await page.locator('[data-ui-id="message-success"]').textContent();
  expect(message?.trim()).toBe('Order processed successfully by Lloyds Cardnet Payment.');
});
