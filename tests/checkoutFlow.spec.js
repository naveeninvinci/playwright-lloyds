// tests/checkoutFlow.spec.js
import { test, expect } from '@playwright/test';
import cardData from '../data/cards.json' assert { type: 'json' };
import productScenarios from '../data/products.json' assert { type: 'json' };
import { shippingDetails } from '../data/shippingData.js';
import {
  addProductsToCart,
  proceedToCheckout,
  fillShippingDetails,
  selectLloydsCardnetPaymentJs,
  selectLloydsCardnetConnect,
  fillPaymentDetails,
  validatePaymentFields,
  fillRedirectPaymentDetails,
  fillBillingAddressConditionally,
  verifyBillingDetails
} from '../utils/checkoutHelpers.js';

for (const scenario of productScenarios) {
  test.describe(`${scenario.label}`, () => {
    test.beforeEach(async ({ page }) => {
      await addProductsToCart(page, scenario.products);
      await proceedToCheckout(page);
      const { chosenOption, expectedPrice } = await fillShippingDetails(page, shippingDetails.shipping);

// Later, if ko_unique_5 was chosen, assert the price on the next page:
if (chosenOption === 'ko_unique_5') {
  const priceOnNextPage = await page.locator('span.price[data-th="Shipping"]').textContent();
  expect(priceOnNextPage?.trim()).toBe(expectedPrice);
  console.log(expectedPrice ,'matches', priceOnNextPage?.trim());
}
    });

    // test.describe('Redirect payment flow', () => {
    //   for (const card of cardData) {
    //     test(`Redirect Checkout: ${card.label}`, async ({ page }) => {
    //       await selectLloydsCardnetConnect(page);
    //       await fillBillingAddressConditionally(page, shippingDetails.billing);
    //       await verifyBillingDetails(page, shippingDetails.shipping, shippingDetails.billing);
    //       await page.locator('button:has-text("Place Order"):not([disabled])').first().click();
    //       await page.waitForSelector('input#cardNumber, #select2-brandTypeSelect-container', { timeout: 20000 });
    //       await fillRedirectPaymentDetails(page, card, card.challengeChoice);
    //     });
    //   }
    // });

    test.describe('JS iframe payment flow', () => {
      for (const card of cardData) {
        test(`JS Checkout: ${card.label}`, async ({ page }) => {
          await selectLloydsCardnetPaymentJs(page);
          await fillBillingAddressConditionally(page, shippingDetails.billing);
          await verifyBillingDetails(page, shippingDetails.shipping, shippingDetails.billing);
          await fillPaymentDetails(page, card);
          const allValid = await validatePaymentFields(page);

          if (allValid) {
            console.log(`${card.label} — All payment fields are valid. Placing order...`);
            const placeOrderBtn = page.locator('button:has-text("Place Order")').filter({
              hasNotText: 'GooglePay',
            }).nth(1); // or adjust this index based on DOM if needed
            
            await placeOrderBtn.waitFor({
              state: 'visible',
              timeout: 20000, // wait up to 20 seconds for visibility
            });
            
            // Wait for button to be enabled
            await expect(placeOrderBtn).toBeEnabled({ timeout: 20000 });
            
            await placeOrderBtn.click();
          } else {
            console.warn(`${card.label} — Some fields are invalid. Skipping order.`);
          }
        });
      }
    });
  });
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    console.log(`Test failed: ${testInfo.title}`);
    await page.screenshot({
      path: `screenshots/${testInfo.title.replace(/\s+/g, '_')}.png`,
      fullPage: true,
    });
  }
});