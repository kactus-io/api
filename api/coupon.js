const stripe = require('stripe')(process.env.STRIPE_SECRET)

module.exports.handler = (event, context, callback) => {
  const coupon = decodeURIComponent(event.coupon)

  return stripe.coupon.retrieve(coupon)
    .then(coupon => {
      console.log(coupon)
      if (coupon && coupon.valid) {
        const discount = '-' +
          (coupon.amount_off
            ? (coupon.amount_off + coupon.currency)
            : (coupon.percent_off + '%')) +
          (coupon.duration_in_months
            ? (' for ' + coupon.duration_in_months + ' month' +
              (coupon.duration_in_months > 1 ? 's' : ''))
            : '')
        return callback(null, {
          ok: true,
          discount: discount,
          requestId: event.requestId
        })
      } else {
        return callback(null, {
          ok: true,
          error: 'Coupon not valid anymore',
          requestId: event.requestId
        })
      }
    })
    .catch((err) => {
      console.error(err)
      return callback(null, {
        ok: true,
        error: 'Coupon not found',
        requestId: event.requestId
      })
    })
}
