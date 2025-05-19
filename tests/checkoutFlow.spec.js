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
  verifyBillingDetails,
  clickPlaceOrderButton,
  handleOrderResult
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
            // Wait for the spinner to disappear before proceeding
            await page.locator('.loading-mask, .spinner, .loading-indicator').waitFor({
            state: 'hidden',
            timeout: 10000,
  }); 
            //Function for Payment js Place Order click
            clickPlaceOrderButton(page);
            await handleOrderResult(page);
          } else {
            console.warn(`${card.label} — Some fields are invalid. Skipping order.`);
          }
        });
      }
    });

    test.describe('Redirect payment flow', () => {
      for (const card of cardData) {
        test(`Redirect Checkout: ${card.label}`, async ({ page }) => {
          await selectLloydsCardnetConnect(page);
          await fillBillingAddressConditionally(page, shippingDetails.billing);
          await verifyBillingDetails(page, shippingDetails.shipping, shippingDetails.billing);
          await page.locator('button:has-text("Place Order"):not([disabled])').first().click();
          await page.waitForSelector('input#cardNumber, #select2-brandTypeSelect-container', { timeout: 20000 });
          await fillRedirectPaymentDetails(page, card, card.challengeChoice);
          await handleOrderResult(page);
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