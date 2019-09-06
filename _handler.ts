import { APIGatewayProxyEvent, APIGatewayProxyHandler } from 'aws-lambda'

export const _handler = (
  fn: (event: APIGatewayProxyEvent) => Promise<any>
): APIGatewayProxyHandler => async (event: APIGatewayProxyEvent) => {
  try {
    const result = await fn(event)

    return {
      statusCode: result.status || 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify(result),
    }
  } catch (err) {
    console.error(err)
    let statusCode = err.status || 500
    let message = err.message
    if (err.type) {
      switch (err.type) {
        case 'StripeCardError':
          // A declined card error
          statusCode = 400
          break
        case 'RateLimitError':
          // Too many requests made to the API too quickly
          message = 'Server is a bit overloaded, try again in a bit'
          statusCode = 503
          break
        case 'StripeInvalidRequestError':
          // Invalid parameters were supplied to Stripe's API
          message = 'Bad request'
          statusCode = 400
          break
        case 'StripeAPIError':
          // An error occurred internally with Stripe's API
          message = 'Stripe failed, sorry about that'
          break
        case 'StripeConnectionError':
          // Some kind of error occurred during the HTTPS communication
          message = 'Stripe is down, sorry about that'
          break
        case 'StripeAuthenticationError':
          // You probably used an incorrect API key
          message = 'How did that happen!?'
          break
        default:
          // Handle any other types of unexpected errors
          break
      }
    }

    return {
      statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({
        message,
      }),
    }
  }
}
