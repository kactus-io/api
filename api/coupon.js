const stripe = require('stripe')(process.env.STRIPE_SECRET)
const makeCallback = require('./_makeCallback')

module.exports.handler = (event, context, callback) => {
  const coupon = decodeURIComponent(event.pathParameters.coupon)
  const requestId = parseInt(event.queryStringParameters.requestId)

  return stripe.coupons.retrieve(coupon)
    .then(coupon => {
      console.log(coupon)
      if (coupon && coupon.valid) {
        const discount = (coupon.amount_off
          ? (coupon.amount_off + coupon.currency)
          : (coupon.percent_off + '%')) +
          ' off' +
          (coupon.duration_in_months
            ? (' for ' + coupon.duration_in_months + ' month' +
              (coupon.duration_in_months > 1 ? 's' : ''))
            : '')
        return makeCallback(callback, {
          ok: true,
          percent_off: coupon.percent_off,
          amount_off: coupon.amount_off,
          currency: coupon.currency,
          duration_in_months: coupon.duration_in_months,
          discount: discount,
          requestId: requestId
        })
      } else {
        return makeCallback(callback, {
          ok: true,
          error: 'Coupon not valid anymore',
          requestId: requestId
        })
      }
    })
    .catch((err) => {
      console.error(err)
      return makeCallback(callback, {
        ok: true,
        error: 'Coupon not found',
        requestId: requestId
      })
    })
}
