
import { test, expect } from '@playwright/test';
import cardData from '../data/cardsInvalid.json' assert { type: 'json' };
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
  fillBillingAddressForPaymentJS,
  fillBillingAddressForRedirect,
  verifyBillingDetails,
  clickPlaceOrderButton,
  handleOrderResult,
  waitForAllPaymentIframesToBeReady
} from '../utils/checkoutHelpers.js';

// 🔀 Pick one product scenario randomly
const randomIndex = Math.floor(Math.random() * productScenarios.length);
const scenario = productScenarios[randomIndex];

// 🔀 Randomly pick 1 card
const shuffled = cardData.sort(() => 0.5 - Math.random());
const selectedCard = shuffled.slice(0, 1);

  test.describe(`Chosen either a single or multiple products`, () => {
    console.log(`Running with product: ${scenario.label}`);
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
      
        test(`JS Checkout: iFrame randomly selectedCard`, async ({ page }) => {
          for (const card of selectedCard) {
          console.log(`Running test for card: ${card.label}`);

          await selectLloydsCardnetPaymentJs(page);
          await fillBillingAddressForPaymentJS(page, shippingDetails.billing);
          await verifyBillingDetails(page, shippingDetails.shipping, shippingDetails.billing);
          await waitForAllPaymentIframesToBeReady(page);
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
            await clickPlaceOrderButton(page, card.challengeChoice);
            await handleOrderResult(page, 'iframe', true); // failure might occur
          } else {
            console.warn(`${card.label} — Some fields are invalid. Skipping order.`);
          }
        }
        });
      
        test(`Redirect Checkout: randomly selectedCard`, async ({ page }) => {
          for (const card of selectedCard) {
            console.log(`Running test for Redirect card: ${card.label}`);
          await selectLloydsCardnetConnect(page);
          await fillBillingAddressForRedirect(page, shippingDetails.billing);
          await verifyBillingDetails(page, shippingDetails.shipping, shippingDetails.billing);
          await page.locator('button:has-text("Place Order"):not([disabled])').first().click();
          await page.waitForSelector('input#cardNumber, #select2-brandTypeSelect-container', { timeout: 20000 });
          await fillRedirectPaymentDetails(page, card, card.challengeChoice);
          await handleOrderResult(page, 'redirect', true);  // failure might occur
          }
        });
  });

// 🔻 Screenshot on failure
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    console.log(`Test failed: ${testInfo.title}`);
    await page.screenshot({
      path: `screenshots/${testInfo.title.replace(/\s+/g, '_')}.png`,
      fullPage: true,
    });
  }
});