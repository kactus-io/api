module.exports.handler = (event, context, callback) => {
  console.log(JSON.stringify(event))
  callback(null, {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*', // Required for CORS support to work
      'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
    },
    body: '{"ok": true}'
  })
}
