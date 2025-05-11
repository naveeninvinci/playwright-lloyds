import { test, expect } from '@playwright/test';
import cardData from '../data/cards.json' assert { type: 'json' };
import { shippingDetails } from '../data/shippingData.js';
import {
  navigateToProductAndAddToCart,
  proceedToCheckout,
  fillShippingDetails,
  selectLloydsCardnetPaymentJs,
  selectLloydsCardnetConnect,
  fillPaymentDetails,
  validatePaymentFields,
  fillRedirectPaymentDetails,
} from '../utils/checkoutHelpers.js';

// Shared setup
test.describe.parallel('Checkout flows', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToProductAndAddToCart(page);
    await proceedToCheckout(page);
    await fillShippingDetails(page, shippingDetails);
  });

  test.describe('Redirect payment flow', () => {
    for (const card of cardData) {
      test(`Redirect Checkout: ${card.label}`, async ({ page }) => {
        await selectLloydsCardnetConnect(page);

        await page.locator('button:has-text("Place Order"):not([disabled])').first().click();
        await page.waitForSelector('input#cardNumber, #select2-brandTypeSelect-container', { timeout: 20000 });

        await fillRedirectPaymentDetails(page, card);
      });
    }
  });

  test.describe('JS iframe payment flow', () => {
    for (const card of cardData) {
      test(`JS Checkout: ${card.label}`, async ({ page }) => {
        await selectLloydsCardnetPaymentJs(page);
        await fillPaymentDetails(page, card);

        const allValid = await validatePaymentFields(page);
        if (allValid) {
          console.log(`${card.label} — All payment fields are valid. Placing order...`);
        } else {
          console.warn(`${card.label} — Some fields are invalid. Skipping order.`);
        }
      });
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.log(`Test failed: ${testInfo.title}`);
      await page.screenshot({ path: `screenshots/${testInfo.title.replace(/\s+/g, '_')}.png`, fullPage: true });
    }
  });
});
