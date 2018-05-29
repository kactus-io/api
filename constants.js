module.exports.PLANS = {
  premium: {
    month: 'kactus-1-month',
    year: 'kactus-1-year',
    productId: process.env.ENV === 'dev' ? 'prod_BTkV9Cu3EWyDf4' : 'prod_BTo9ai5jICwEbp'
  },
  enterprise: {
    month: 'kactus-enterprise-1-month',
    year: 'kactus-enterprise-1-year',
    productId: process.env.ENV === 'dev' ? 'prod_BUhPr7ozRkHjo9' : 'prod_BTqaZPV0pB7Xd4'
  }
}
