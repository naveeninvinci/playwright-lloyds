import { expect } from '@playwright/test';

async function addProductsToCart(page, productUrls) {
  for (const url of productUrls) {
    await page.goto(url);
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await page.waitForTimeout(1000); // Slight delay between additions
  }
  // Go to cart after adding products
  await page.getByRole('link', { name: 'shopping cart' }).click();
  await page.waitForSelector('button[data-role="proceed-to-checkout"]', { timeout: 20000 });
}

async function proceedToCheckout(page) {
  await page.waitForSelector('button[data-role="proceed-to-checkout"]', { timeout: 20000 });
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

  // Choose a shipping method randomly
  const shippingOptions = ['ko_unique_4', 'ko_unique_5'];
  const chosenOption = shippingOptions[Math.floor(Math.random() * shippingOptions.length)];
  const shippingMethod = page.locator(`input[type="radio"][name="${chosenOption}"]`);

  await expect(shippingMethod).toBeVisible({ timeout: 10000 });
  await shippingMethod.check();

  console.log(`📦 Selected shipping method: ${chosenOption}`);


  let expectedPrice = null;

  // If ko_unique_5 is selected, store its price
  if (chosenOption === 'ko_unique_5') {
    const priceElement = page
      .locator('input[name="ko_unique_5"]')
      .locator('xpath=ancestor::tr//td[contains(@class, "col-price")]//span[@class="price"]')
      .first();
  
    await expect(priceElement).toBeVisible({ timeout: 5000 });
  
    const priceText = await priceElement.textContent();
    expectedPrice = priceText?.trim();
  
    console.log('💰 Extracted shipping price:', expectedPrice);
  }

  await page.locator('button[data-role="opc-continue"]').click();

  return { chosenOption, expectedPrice };

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
}

export async function handleOrderResult(page) {
  const successMsg = page.locator('[data-ui-id="message-success"]');
  const errorMsg = page.locator('[data-ui-id="checkout-cart-validationmessages-message-error"]');

  // Wait for either success or failure message
  await Promise.race([
    successMsg.waitFor({ timeout: 25000 }),
    errorMsg.waitFor({ timeout: 25000 }),
  ]);

  // Check which one is visible and act accordingly
  if (await successMsg.isVisible()) {
    console.log('✅ Success message appeared');
    await verifyOrderSuccessMessage(page);
  } else if (await errorMsg.isVisible()) {
    console.log('❌ Error message appeared');
    await verifyPaymentFailureMessage(page);
  } else {
    throw new Error('⚠️ Neither success nor failure message appeared after placing the order.');
  }
}

async function fillFirstVisibleInput(locator, value) {
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const el = locator.nth(i);
    if (await el.isVisible()) {
      await el.fill(value);
      return;
    }
  }
  throw new Error('No visible input found for filling');
}

async function fillFirstVisibleSelect(locator, value) {
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const el = locator.nth(i);
    if (await el.isVisible()) {
      await el.selectOption(value);
      return;
    }
  }
  throw new Error('No visible select found for selecting option');
}

async function clickFirstVisibleButton(page, selector) {
  const buttons = page.locator(selector);
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    if (await btn.isVisible()) {
      await btn.click();
      return;
    }
  }
  throw new Error(`No visible button found for selector: ${selector}`);
}

async function fillBillingAddressConditionally(page, billingData) {
   // Try both possible checkbox IDs
   const checkboxSelectors = [
    '#billing-address-same-as-shipping-lcnetredirect',
    '#billing-address-same-as-shipping-lcnetpaymentjs'
  ];

  let checkbox;
  for (const selector of checkboxSelectors) {
    const candidate = page.locator(selector);
    try {
      await expect(candidate).toBeVisible({ timeout: 3000 });
      checkbox = candidate;
      break; // Found the first visible one
    } catch {
      // Not visible or not found — move on to the next
    }
  }

  if (!checkbox) {
    console.warn('⚠️ Billing address checkbox not found or visible.');
    return;
  }

  const shouldUncheck = Math.random() < 0.5;
  const isChecked = await checkbox.isChecked();

  if (shouldUncheck && isChecked) {
    await checkbox.uncheck();
    console.log('🟡 Randomly chose: Use different billing address');
    // Wait up to 15 seconds for the form to appear in DOM
await page.waitForSelector('fieldset[data-form="billing-new-address"]', { state: 'attached', timeout: 15000 });

    const formExists = await page.$('fieldset[data-form="billing-new-address"]');
console.log('Billing form exists in DOM?', !!formExists);


const billingFieldset = page.locator('fieldset[data-form="billing-new-address"]');

await fillFirstVisibleInput(billingFieldset.locator('input[name="firstname"]'), billingData.firstname);
    await fillFirstVisibleInput(billingFieldset.locator('input[name="lastname"]'), billingData.lastname);
    await fillFirstVisibleInput(billingFieldset.locator('input[name="company"]'), billingData.company);
    await fillFirstVisibleInput(billingFieldset.locator('input[name="street[0]"]'), billingData.street1);
    await fillFirstVisibleInput(billingFieldset.locator('input[name="street[1]"]'), billingData.street2);
    await fillFirstVisibleSelect(billingFieldset.locator('select[name="country_id"]'), billingData.country);
    await fillFirstVisibleInput(billingFieldset.locator('input[name="city"]'), billingData.city);
    await fillFirstVisibleInput(billingFieldset.locator('input[name="postcode"]'), billingData.postcode);
    await fillFirstVisibleInput(billingFieldset.locator('input[name="telephone"]'), billingData.telephone);

    console.log('✅ Filled different billing address');
    await clickFirstVisibleButton(page, 'button.action-update');

    // After clicking update button
    //await verifyBillingDetails(page, billingData);
  } else {
    console.log('🟢 Keeping billing address same as shipping');
  }
}

export async function verifyBillingDetails(page, shippingData, billingData) {
  // STEP 1: Check the checkbox state first
  const checkboxSelectors = [
    '#billing-address-same-as-shipping',
    '#billing-address-same-as-shipping-lcnetredirect',
    '#billing-address-same-as-shipping-lcnetpaymentjs'
  ];

  let isChecked = false;
  let foundCheckbox = false;

  for (const selector of checkboxSelectors) {
    const checkbox = page.locator(selector);
    if (await checkbox.count() > 0 && await checkbox.isVisible()) {
      isChecked = await checkbox.isChecked();
      console.log(`✅ Checkbox found & visible: '${selector}', isChecked: ${isChecked}`);
      foundCheckbox = true;
      break;
    }
  }

  if (!foundCheckbox) {
    console.warn('⚠️ No visible billing same-as-shipping checkbox found! Assuming billing data used.');
  }

  const expectedData = isChecked ? shippingData : billingData;

  // STEP 2: Locate visible billing block
  const allBillingElements = page.locator('.billing-address-details');
  const count = await allBillingElements.count();

  let visibleIndex = -1;
  for (let i = 0; i < count; i++) {
    if (await allBillingElements.nth(i).isVisible()) {
      visibleIndex = i;
      break;
    }
  }

  if (visibleIndex === -1) {
    if (isChecked) {
      console.warn('⚠️ No visible billing address block found, and checkbox is checked. Skipping billing verification.');
      return;
    } else {
      throw new Error('❌ Expected billing address block to be visible, but it is not!');
    }
  }

  // STEP 3: Validate content
  const billingText = await allBillingElements.nth(visibleIndex).innerText();
  console.log('📋 Billing address text from visible element:\n', billingText);

  expect(billingText).toContain(expectedData.firstname);
  expect(billingText).toContain(expectedData.lastname);
  expect(billingText).toContain(expectedData.company);
  expect(billingText).toContain(expectedData.street1);
  expect(billingText).toContain(expectedData.city);
  expect(billingText).toContain(expectedData.postcode);
  expect(billingText).toContain('United Kingdom');
  expect(billingText).toContain(expectedData.telephone);

  console.log(`✅ Verified billing address (${isChecked ? 'same as shipping' : 'billing details filled'})`);
}

// Reusable function to verify order success message
export async function verifyOrderSuccessMessage(page) {
  const messageLocator = page.locator('[data-ui-id="message-success"]');

  // Wait for the full message text to appear
  await expect(messageLocator).toContainText('Your order number with', {
    timeout: 15000, // increase timeout to wait for full message rendering
  });

  const fullMessage = await messageLocator.textContent();
  expect(fullMessage).toMatch(/Your order number with \d+ is successful/);

  console.log(`✅ Verified success message: ${fullMessage}`);
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

export async function waitUntilPaymentFieldsFilledAndPlaceOrder(page) {
  const cardHolder = page.locator('input[name="payment[cc_owner]"]'); // Update selector if needed
  const cardNumber = page.locator('input[name="payment[cc_number]"]');
  const expiryDate = page.locator('input[name="payment[cc_exp]"]'); // or split fields for MM/YY
  const cvv = page.locator('input[name="payment[cc_cid]"]');

  // Wait until all inputs have values
  await expect(cardHolder).toHaveValue(/.+/, { timeout: 15000 });
  await expect(cardNumber).toHaveValue(/\d{4} \d{4} \d{4} \d{4}/, { timeout: 15000 });
  await expect(expiryDate).toHaveValue(/\d{2} \/ \d{2}/, { timeout: 15000 });
  await expect(cvv).toHaveValue(/\d{3,4}/, { timeout: 15000 });

  console.log('✅ All payment fields are filled');

  // Now call your click function
  await clickPlaceOrderButton(page);
}

export async function clickPlaceOrderButton(page) {
  const placeOrderBtn = page.locator('button:has-text("Place Order")').filter({
    hasNotText: 'GooglePay',
  }).nth(1); // Adjust index if needed

  await placeOrderBtn.waitFor({
    state: 'visible',
    timeout: 20000,
  });

  await expect(placeOrderBtn).toBeEnabled({ timeout: 20000 });

  console.log('🖱️ Clicking Place Order button...');
  
  // Wait for navigation or success indicator
  await Promise.all([
    page.waitForLoadState('domcontentloaded'), // or 'networkidle' if appropriate
    placeOrderBtn.click(),
  ]);
}

export {
  addProductsToCart,
  proceedToCheckout,
  fillShippingDetails,
  selectLloydsCardnetPaymentJs,
  selectLloydsCardnetConnect,
  fillPaymentDetails,
  validatePaymentFields,
  fillRedirectPaymentDetails,
  fillBillingAddressConditionally
};
