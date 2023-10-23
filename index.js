const client = require('prom-client');
const fastFolderSize = require('fast-folder-size')
const fs = require('fs/promises')
const express = require('express')
const app = express()
const Registry  = client.Registry;
const register = new Registry();
client.collectDefaultMetrics({ register });
const port = process.env.SERVER_PORT | 3000

let paths = process.env.PATHS.split(',')
console.log("Analyse des paths", paths)
let gaugeSize = new client.Gauge({ name: 'directory_size', help: 'Size of the directory', labelNames: ['path'] })
let gaugeTime = new client.Gauge({ name: 'directory_size_evaluation_time', help: 'Duration of evaluation of the path', labelNames: ['path'] })
register.registerMetric(gaugeSize)
register.registerMetric(gaugeTime)
app.get('/', (req, res) => {
    let allPathPromise = paths.map(path => {
        let timer = gaugeTime.startTimer({ path: path });
        var allPathPromise;
        if (path.endsWith("*")) {
            var parentPath = path.slice(0, path.length - 2);
            allPathPromise = fs.readdir(parentPath, { withFileTypes: true })
                .then(dir => dir.filter(dirent => dirent.isDirectory()).map(dirent => dirent.path + "/" + dirent.name))
                .then(allSubPath => [...allSubPath, parentPath])
        } else {
            allPathPromise = new Promise((resolve, reject) => {
                resolve([path])
            });
        }
        
        return allPathPromise.then(allPath => {
            return allPath.map(subPath => {
                return new Promise((res, reject) => {
                    fastFolderSize(subPath, (err, bytes) => {
                        if (err) {
                            console.error("Erreur dans l'analyse du path ", subPath, err)
                            reject(err)
                        }
                        gaugeSize.set({ path: subPath }, bytes)
                        timer()
                        console.debug(subPath, "path size:", bytes)
                        res(bytes)
                    })

                })

            })

        })
        .then(result => Promise.all(result))
        .then(result=>console.log("Final result :", result))
    })
    Promise.all(allPathPromise).then(val=>{
        register.metrics().then((metrics)=>res.send(metrics))

    })
})
app.listen(port, () => {
    console.log(`Metrics app listening on port ${port}`)
})
