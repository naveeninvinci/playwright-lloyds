import { expect, test } from '@playwright/test';

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
  await handle3DSChallenge(page, choice ?? null);
}

async function expectSuccessMessage(page, flowType) {
  const successMsg = page.locator('[data-ui-id="message-success"]');
  await successMsg.waitFor({ timeout: 25000 });

  if (await successMsg.isVisible()) {
    console.log('✅ Success message appeared');
    if (flowType === 'iframe') {
      await verifyIframeSuccessMessage(page);
    } else if (flowType === 'redirect') {
      await verifyRedirectSuccessMessage(page);
    } else {
      throw new Error(`Unknown flow type: ${flowType}`);
    }
  } else {
    throw new Error('⚠️ Expected success message, but none appeared.');
  }
}

async function expectFailureMessage(page, flowType) {
  const errorMsg = page.locator('[data-ui-id="checkout-cart-validationmessages-message-error"]').first();
  await errorMsg.waitFor({ timeout: 25000 });

  if (await errorMsg.isVisible()) {
    console.log('❌ Error message appeared');
    await verifyPaymentFailureMessage(page, flowType);
  } else {
    throw new Error('⚠️ Expected error message, but none appeared.');
  }
}

export async function handleOrderResult(page, flowType, shouldExpectFailure = false) {
  try {
    if (shouldExpectFailure) {
      await expectFailureMessage(page, flowType);
    } else {
      await expectSuccessMessage(page, flowType);
    }
  } catch (error) {
    console.error('❗️Neither success nor error message appeared within timeout. Taking screenshot...');
    try {
      await page.screenshot({ path: `screenshots/missing-message-${Date.now()}.png`, fullPage: true });
    } catch (screenshotError) {
      console.warn('⚠️ Could not take screenshot — page may already be closed.');
    }
    throw error;
  }
}

async function fillFirstVisible(locator, action, value) {
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const el = locator.nth(i);
    if (await el.isVisible()) {
      if (action === 'fill') await el.fill(value);
      if (action === 'select') await el.selectOption(value);
      return;
    }
  }
  throw new Error(`No visible element found for action: ${action}`);
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

async function fillBillingAddressForRedirect(page, billingData) {
  const checkbox = page.locator('#billing-address-same-as-shipping-lcnetredirect');

  try {
    await expect(checkbox).toBeVisible({ timeout: 3000 });
  } catch {
    console.warn('⚠️ Redirect billing checkbox not visible. Skipping.');
    return;
  }

  await fillBillingFormIfNeeded(page, checkbox, billingData);
}

async function fillBillingAddressForPaymentJS(page, billingData) {
  const checkbox = page.locator('#billing-address-same-as-shipping-lcnetpaymentjs');

  try {
    await expect(checkbox).toBeVisible({ timeout: 3000 });
  } catch {
    console.warn('⚠️ PaymentJS billing checkbox not visible. Skipping.');
    return;
  }

  await fillBillingFormIfNeeded(page, checkbox, billingData);
}

async function fillBillingFormIfNeeded(page, checkbox, billingData) {
  const shouldUncheck = Math.random() < 0.5;
  const isChecked = await checkbox.isChecked();

  if (shouldUncheck && isChecked) {
    await checkbox.uncheck();
    console.log('🟡 Randomly chose: Use different billing address');

    await page.waitForSelector('fieldset[data-form="billing-new-address"]', {
      state: 'attached',
      timeout: 15000
    });

    const billingFieldset = page.locator('fieldset[data-form="billing-new-address"]');

    await fillFirstVisible(billingFieldset.locator('input[name="firstname"]'), 'fill', billingData.firstname);
    await fillFirstVisible(billingFieldset.locator('input[name="lastname"]'), 'fill', billingData.lastname);
    await fillFirstVisible(billingFieldset.locator('input[name="company"]'), 'fill', billingData.company);
    await fillFirstVisible(billingFieldset.locator('input[name="street[0]"]'), 'fill', billingData.street1);
    await fillFirstVisible(billingFieldset.locator('input[name="street[1]"]'), 'fill', billingData.street2);
    await fillFirstVisible(billingFieldset.locator('select[name="country_id"]'), 'select', billingData.country);
    await fillFirstVisible(billingFieldset.locator('input[name="city"]'), 'fill', billingData.city);
    await fillFirstVisible(billingFieldset.locator('input[name="postcode"]'), 'fill', billingData.postcode);
    await fillFirstVisible(billingFieldset.locator('input[name="telephone"]'), 'fill', billingData.telephone);

    console.log('✅ Filled different billing address');
    await clickFirstVisibleButton(page, 'button.action-update');
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
      // Wait a little for billing to render before failing
      await page.waitForTimeout(1000); // Short delay for DOM update
      for (let i = 0; i < count; i++) {
        if (await allBillingElements.nth(i).isVisible()) {
          visibleIndex = i;
          break;
        }
      }
  
      if (visibleIndex === -1) {
        throw new Error('❌ Expected billing address block to be visible, but it is not – even after wait!');
      }
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

export async function verifyIframeSuccessMessage(page) {
  const successLocator = page.locator('[data-ui-id="message-success"]');
  await expect(successLocator).toHaveText('Order processed successfully by Lloyds Cardnet Payment.', {
    timeout: 15000,
  });
  console.log('✅ iFrame success message verified.');

  // Extract order number
  const orderNumberLocator = page.locator('.checkout-success p span');
  const orderNumber = (await orderNumberLocator.textContent())?.trim() || 'N/A';
  console.log(`🧾 Order number: ${orderNumber}`);

  // Capture screenshot
  const screenshot = await page.screenshot({ fullPage: true });

  // Attach to Playwright test report
  await test.info().attach('Order Confirmation Screenshot', {
    body: screenshot,
    contentType: 'image/png',
  });

  // Optionally log the order number as a text attachment
  await test.info().attach('Order Number', {
    body: Buffer.from(orderNumber, 'utf-8'),
    contentType: 'text/plain',
  });
}

export async function verifyRedirectSuccessMessage(page) {
  const locator = page.locator('[data-ui-id="message-success"]');

  await expect(locator).toContainText('Your order number with', {
    timeout: 15000,
  });

  const text = await locator.textContent();
  expect(text).toMatch(/Your order number with \d+ is successful/);

  console.log(`✅ Redirect success message: ${text}`);

  // Extract order number
  const orderNumberLocator = page.locator('.checkout-success p span');
  const orderNumber = (await orderNumberLocator.textContent())?.trim() || 'N/A';
  console.log(`🧾 Order number: ${orderNumber}`);

  // Capture screenshot
  const screenshot = await page.screenshot({ fullPage: true });

  // Attach to Playwright test report
  await test.info().attach('Redirect Order Confirmation Screenshot', {
    body: screenshot,
    contentType: 'image/png',
  });

  // Optionally log the order number as a text attachment
  await test.info().attach('Redirect Order Number', {
    body: Buffer.from(orderNumber, 'utf-8'),
    contentType: 'text/plain',
  });
}

export async function verifyPaymentFailureMessage(page, flowType = 'iframe') {
  const errorLocator = page.locator('[data-ui-id="checkout-cart-validationmessages-message-error"]');

  // Wait for at least one error to show
  await expect(errorLocator.first()).toBeVisible({ timeout: 10000 });

  const allErrors = await errorLocator.allTextContents();
  console.log('🔴 Found error messages:', allErrors);

  if (flowType === 'iframe') {
    const expectedSubstrings = [
      'Transaction declined. 3D Secure authentication failed.',
      'There is an error with the payment. Your order',
    ];

    for (const expected of expectedSubstrings) {
      expect(allErrors.some(msg => msg.includes(expected))).toBeTruthy();
    }

  } else if (flowType === 'redirect') {
    const found = allErrors.some(msg =>
      msg.includes('Declined: Your bank has declined the payment')
    );
    expect(found).toBeTruthy();
  } else {
    throw new Error(`Unknown flowType: ${flowType}`);
  }

  console.log(`✅ ${flowType} payment failure messages verified.`);
}

async function waitForAllPaymentIframesToBeReady(page) {
  const fieldConfig = [
    { frameId: '#first-data-payment-field-name', inputSelector: 'input[name="name"]' },
    { frameId: '#first-data-payment-field-card', inputSelector: 'input[name="card"]' },
    { frameId: '#first-data-payment-field-exp', inputSelector: 'input[name="exp"]' },
    { frameId: '#first-data-payment-field-cvv', inputSelector: 'input[name="cvv"]' },
  ];

  for (const { frameId, inputSelector } of fieldConfig) {
    const frame = page.frameLocator(frameId);
    const input = frame.locator(inputSelector);
    await input.waitFor({
      timeout: 10000,
      state: 'visible',
    });
    console.log(`✅ Ready: ${frameId} -> ${inputSelector}`);
  }
}

export async function handle3DSChallenge(page, choice = 'yes') {
  // explicitly skip when undefined
if (choice === undefined || choice === null || choice === '') {
  console.log('ℹ️ No 3DS challenge expected for this card – skipping');
  return;
}

  try {
    console.log('⏳ Waiting for possible 3DS redirect...');
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await page.waitForTimeout(1000); // short buffer

    // Wait and re-check frame dynamically
    const modirumFrame = await waitForModirumFrame(page, 20000);

    if (modirumFrame) {
      console.log('🔍 3DS iframe detected');

      const success = await clickInFrame(modirumFrame, choice);
      if (success) return;
      console.warn('⚠️ Retry: frame might have detached, re-checking...');
      
      // Retry once more with fresh frame in case of detachment
      const freshFrame = await waitForModirumFrame(page, 5000);
      if (freshFrame) {
        const retried = await clickInFrame(freshFrame, choice);
        if (retried) return;
      }
    }

    // Fallback on main page
    const mainButton = page.locator(`button:has-text("${choice.trim().toLowerCase()}")`);
    if (await mainButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await mainButton.click();
      console.log(`✅ Clicked "${choice}" on main page`);
      return;
    }

    console.log('ℹ️ 3DS challenge not shown – skipping');
  } catch (err) {
    console.error(`❌ 3DS challenge error: ${err.message}`);
    await page.screenshot({ path: `screenshots/3ds-error-${Date.now()}.png`, fullPage: true });
    throw err;
  }
}

async function sleepQuietly(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForModirumFrame(page, timeout = 10000, pollInterval = 250) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const frames = page.frames();
    const modirumFrame = frames.find(f => f.url().includes('modirum'));

    if (modirumFrame) {
      console.log(`✅ Detected modirum frame: ${modirumFrame.url()}`);
      return modirumFrame;
    }

    await sleepQuietly(pollInterval);
  }

  console.warn(`⏱ waitForModirumFrame timed out after ${timeout}ms`);
  return null;
}

async function clickInFrame(frame, choice) {
  try {
    const button = await frame.waitForSelector(`button:has-text("${choice}")`, { timeout: 15000 });
    await button.click();
    console.log(`✅ Clicked "${choice}" inside 3DS iframe`);
    return true;
  } catch (err) {
    if (err.message.includes('Frame was detached')) {
      console.warn('⚠️ Frame detached during click – will retry');
    } else {
      console.warn(`⚠️ Could not click button in iframe: ${err.message}`);
    }
    return false;
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

export async function clickPlaceOrderButton(page, choice = 'yes') {
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

  // 🔐 Handle 3DS authentication
  await handle3DSChallenge(page, choice ?? null);
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
  fillBillingAddressForPaymentJS,
  fillBillingAddressForRedirect,
  waitForAllPaymentIframesToBeReady
};
