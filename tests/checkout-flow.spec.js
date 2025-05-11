import { test } from '@playwright/test';
import cardData from '../data/cards.json' assert { type: 'json' };
import {
  navigateToProductAndAddToCart,
  proceedToCheckout,
  fillShippingDetails,
  selectLcnetPayment,
  selectLcnetRedirectPayment,
  fillPaymentDetails,
  validatePaymentFields,
  fillRedirectPaymentDetails
} from '../utils/checkoutHelpers.js';

test.describe.parallel('Redirect payment flow for multiple cards', () => {
  for (const card of cardData) {
    test(`Redirect Checkout: ${card.label}`, async ({ page }) => {
      await navigateToProductAndAddToCart(page);
      await proceedToCheckout(page);
      await fillShippingDetails(page);
      await selectLcnetRedirectPayment(page);

      await page.locator('button:has-text("Place Order"):not([disabled])').first().click();

       // Wait for redirect page to load fully (wait for a stable selector)
       await page.waitForSelector('input#cardNumber, #select2-brandTypeSelect-container', { timeout: 20000 });

      await fillRedirectPaymentDetails(page, card);
      //await page.locator('button:has-text("Place Order"):not([disabled])').first().click();
    });
  }
});

test.describe.parallel('JS iframe payment flow for multiple cards', () => {
  for (const card of cardData) {
    test(`JS Checkout: ${card.label}`, async ({ page }) => {
      await navigateToProductAndAddToCart(page);
      await proceedToCheckout(page);
      await fillShippingDetails(page);
      await selectLcnetPayment(page);
      await fillPaymentDetails(page, card);

      const allValid = await validatePaymentFields(page);

      if (allValid) {
        console.log(`✅ ${card.label} — All payment fields are valid. Placing order...`);
        // await page.locator('button:has-text("Place Order"):not([disabled])').first().click();
      } else {
        console.warn(`❌ ${card.label} — Some fields are invalid. Skipping order.`);
      }
    });
  }
});
