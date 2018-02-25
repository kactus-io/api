const makeCallback = require('./_makeCallback')

module.exports = callback => err => {
  console.error(err)
  if (!err.type) {
    makeCallback(callback, err.message, 500)
    return
  }
  switch (err.type) {
    case 'StripeCardError':
      // A declined card error
      const message = err.message // => e.g. "Your card's expiration year is invalid."
      makeCallback(callback, message, 400)
      break
    case 'RateLimitError':
      // Too many requests made to the API too quickly
      makeCallback(callback, 'Server is a bit overloaded, try again in a bit', 503)
      break
    case 'StripeInvalidRequestError':
      // Invalid parameters were supplied to Stripe's API
      makeCallback(callback, 'Bad request', 400)
      break
    case 'StripeAPIError':
      // An error occurred internally with Stripe's API
      makeCallback(callback, 'Stripe failed, sorry about that', 500)
      break
    case 'StripeConnectionError':
      // Some kind of error occurred during the HTTPS communication
      makeCallback(callback, 'Stripe is down, sorry about that', 500)
      break
    case 'StripeAuthenticationError':
      // You probably used an incorrect API key
      makeCallback(callback, 'How did that happen!?', 500)
      break
    default:
      // Handle any other types of unexpected errors
      makeCallback(callback, err.message, 500)
      break
  }
}
