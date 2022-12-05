const http = require('http')
const readStream = require('./read-stream.js')

/*
const url = 'https://httpbin.org/post'
const data = {
    x: 1920,
    y: 1080,
};
const customHeaders = {
    "Content-Type": "application/json",
}

fetch(url, {
    method: "POST",
    headers: customHeaders,
    body: JSON.stringify(data),
})
    .then((response) => response.json()) // response.text();
    .then((data) => {
        console.log(data);
    });
*/


async function request(address, body) {
  let headers = {}
  if (body) headers['content-type'] = 'application/json'
  try {
    let options = {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }
    // console.log({options})
    let response = await fetch(address, options)

    // console.log({response})
    // TODO check response.status & response.statusText
    let result = await response.text()
    // console.log('http-request', {resultText: result})
    try {
      result = await JSON.parse(result)
    } catch (err) {
      // console.log('http-request', 'json parse failed for', result)
      // if (result)
      result = result.slice(1,-1)
    }
    // console.log('http-request', {result})
    return result
  } catch (err) {
    console.error(err.stack) // TODO
    throw err
  }
}


// async function request(address, body) {
//   let headers = { ['content-type']: 'application/json' }
//   return new Promise((resolve, reject) => {
//     try {
//       // TODO use native fetch API?
//       let req = http.request({
//         method: 'POST',
//         host: address.split(':').slice(0,1).join(':'),
//         port: address.split(':')[1],
//         headers
//       }, async res => {
//         let result = await readStream(res)
//         if (res.statusCode >= 400) reject(new Error(result.replace('Error: ', '')))
//         else {
//           try {
//             result = JSON.parse(result)
//           } catch (err) { /* don't care */ }
//           resolve(result)
//         }
//       })

//       if (body) {
//         body = JSON.stringify(body)
//         req.write(body)
//       }
//       req.end()
//       req.on('error', err => reject(err))
//     } catch (err) {
//       reject(err)
//     }
//   })
// }

module.exports = request
