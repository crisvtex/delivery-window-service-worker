/*  
    APP: SERVICE WORKER PARA REGLAS DE BLOQUEO DE VENTANAS AGENDADAS
    Logica para comparar los pedidos de las reglas vs los pedidos actuales de la ventana.
    Con esto se debe llamar a la API REST de VTEX para guardar el bloqueo, y luego a
    la API Firestore para cambiar el estado de la regla a "ejecutado" 
*/

// Reference the node-schedule npm package.
const schedule = require('node-schedule');
const FireStoreParser = require('firestore-parser')
const fetch = require('node-fetch')

const admin = require('firebase-admin');

// constantes globales
const projectID = 'bloqueo-de-ventanas'
const key = 'AIzaSyC0AOhmIGX6rQpDJaHoenbnBrjUUrKr_T8'
const collection = 'reglaBloqueo'
const testRegla = '1LsU1SoiQwAqQWqPMASy'

const serviceAccount = require('./serviceAccountKey.json');

const { appKey, appToken } = require('./vtexApiKeys')

//initialize admin SDK using serciceAcountKey
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://bloqueo-de-ventanas.firebaseio.com"
})

const db = admin.firestore();

// funcion helper para los requests API asíncronos
const fetchApi = async (url, options) => { 
    const response = await fetch(url, options)
    const data = await response.json()
    //console.log(data)
    return data
}

// funcion para filtrar objetos
Object.filter = (obj, predicate) => 
Object.assign(...Object.keys(obj)
                .filter( key => predicate(obj[key]) )
                .map( key => ({ [key]: obj[key] }) ) )

const APP = {
scheduleJob: function() {
    // This rule is standard cron syntax for once per minute.
    // See http://stackoverflow.com/a/5398044/1252653
    rule1min = '* * * * *'
    rule1hour = '0 * * * *'
    rule10mins = '*/10 * * * *'

    // Código de recorrer reglas
    const mainJob = async () => {
        // traer el arreglo de reglas activas
        var reglasActivas = await getReglasActivasFetchAPI()
        // console.log('Reglas activas: ', reglasActivas)
        // const reglasActivasCant = await reglasActivas.length
        // console.log('Cantidad Reglas Activas: ', reglasActivasCant)
        
        // recorre las reglas activas
        if(reglasActivas) {
            console.log("si hay reglas activas")
            
            for (regla of reglasActivas)  {
                var idRegla = regla.name.replace('projects/bloqueo-de-ventanas/databases/(default)/documents/reglaBloqueo/', '')
                var carrierId = regla.fields.carrierId
                var ventana = regla.fields.ventanaPorBloquear

                var validacion = await validarRegla(idRegla)
                console.log('validacion:', validacion)

                if(validacion) {
                    // ejecutar bloqueos de ventanas
                    ejecutarRegla(carrierId)
                    // Cambiar estado de reglas ejecutadas
                    setReglaEjecutada(idRegla)
                    console.log(`Regla ${idRegla} ejecutada exitosamente`)
                    console.log(`La ventana de entrega ${ventana} ha sido bloqueada`)        
                } else {
                    console.log(`Regla ${idRegla} no cumple requisitos para bloqueo`)
                }
                
            }
        } else {
            console.log("no hay reglas activas")
            reglasActivas = {}
            return reglasActivas
        }
    }

    const cuentaPedidosDeRegla = async (idRegla) => {
        var cuentaPedidos = 0
        var pedidosFiltrados = []

        // obtiene carrierId desde la regla
        const carrierId = await getCarrierIdRegla(idRegla)

        // traer pedidos de hoy y mañana (list orders) filtrados por carrier
        const pedidos = await getPedidos()
        //console.log("pedidos:", pedidos)

        // obtiene ventana de la regla
        const ventanaRegla = await getVentanaRegla(idRegla)
        //console.log("ventana regla:", ventanaRegla)
    
        const ventanaReglaFormateada = ventanaRegla+'.0000000+00:00'
        //console.log('ventanaReglaFormateada', ventanaReglaFormateada)

        // filtrar por ventana de regla (ShippingEstimatedDateMax) para hacer la cuenta de productos
        if(ventanaReglaFormateada) {
            pedidosFiltrados = await pedidos.filter(pedido => pedido.ShippingEstimatedDateMax != ventanaReglaFormateada)
        }
        //console.log('pedidosFiltrados:', pedidosFiltrados)

        // contar los pedidos (cantidad de elementos en el array anterior)
        cuentaPedidos = Object.keys(pedidosFiltrados).length

        // retornar cuenta de productos
        // console.log('cuentaPedidos:', cuentaPedidos)
        return cuentaPedidos   
    }

    const getPedidos = async () => {
        // traer pedidos de hoy y mañana (list orders)
        const fechaDesde = '2020-04-01T03:00:00.000Z'
        const fechaHasta = '2020-04-03T02:59:59.999Z'

        //falta definir fechas dinámicamente.

        // Endpoint API POST Firestore para hacer update de un registro en la coleccion reglaBloqueo
        const url = `https://vtexchileqa.myvtex.com/api/oms/pvt/orders?f_creationDate=creationDate:[${fechaDesde} TO ${fechaHasta}]&per_page=100`

        const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-VTEX-API-AppKey": appKey,
            "X-VTEX-API-AppToken": appToken
        }
    
        const options = {
            method: 'GET',
            headers,
            redirect: 'no-follow'
        };

        //console.log(url)
        const pedidos = await fetchApi(url,options)
        const cantidadPaginas = pedidos.paging.pages
        var pedidosConsolidado = pedidos.list

        if(cantidadPaginas > 1) {
            for(var i=2; i<=cantidadPaginas; i++) {
                urlPaginada = `${url}&page=${i}`
                // console.log('urlPaginada', urlPaginada)
                const pedidosTemp = await fetchApi(urlPaginada,options)
                //console.log('pedidosTemp', pedidosTemp.list.length)

                for(var i = 0; i <= pedidosTemp.list.length -1 ; i++){
                    pedidosConsolidado.push(pedidosTemp.list[i])
                }
            }
        }

        // console.log('response del getPedidos', pedidos.list)
        // console.log('paging:', pedidos.paging)
        // console.log('pedidosConsolidado:', pedidosConsolidado.length)
        return pedidosConsolidado
    }

    // Código de validar cuando se cumpla una regla, para que sea ejecutada
    const validarRegla = async (idRegla) => {
        const pedidosMaximo = await getCantidadPedidosRegla(idRegla)
        const cuentaPedidos = await cuentaPedidosDeRegla(idRegla)
        console.log('cuentaPedidos: ', cuentaPedidos)
        console.log('pedidosMaximo: ', pedidosMaximo)
        if(cuentaPedidos >= pedidosMaximo) {
            return true
        } else { 
            return false
        }
    }

    // Código de ejecución de regla
    const ejecutarRegla = async (idRegla) => {

        // Endpoint API POST MW Heroku apuntando a Logistics VTEX para guardar un bloqueo de ventana de despacho
        
        const carrierId = getCarrierIdRegla(idRegla)
        const ventana = getVentanaRegla(idRegla)

        const url = `https://fast-waters-15057.herokuapp.com/addBlockedWindows/${carrierId}?windowToBlock=${ventana}`

        const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    
        const options = {
            method: 'POST',
            headers,
            redirect: 'no-follow'
        }
        const response = await fetchApi(url,options)
        // console.log('ejecutarRegla:', response)
        return response
    }

    // Código de consulta estado de regla
    const getEstadoRegla = async (idRegla) => {
        // Endpoint API POST Firestore para hacer update de un registro en la coleccion reglaBloqueo
        const url = `https://firestore.googleapis.com/v1beta1/projects/${projectID}/databases/(default)/documents/${collection}/${idRegla}?key=${key}`

        const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    
        const options = {
            method: 'GET',
            headers,
            redirect: 'no-follow'
        };

        const response = await fetchApi(url,options)
        const parsedResponse = await FireStoreParser(response)
        // console.log('getEstadoRegla:', parsedResponse.fields.estado)
        return parsedResponse.fields.estado
    }

    // Código de consulta estado de regla
    const getVentanaRegla = async (idRegla) => {
        
        const url = `https://firestore.googleapis.com/v1beta1/projects/${projectID}/databases/(default)/documents/${collection}/${idRegla}?key=${key}`
        
        const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    
        const options = {
            method: 'GET',
            headers,
            redirect: 'no-follow'
        };

        const response = await fetchApi(url,options)
        const parsedResponse = await FireStoreParser(response)
        const ventana = await parsedResponse.fields.ventanaPorBloquear
        // console.log('getVentanaRegla:', parsedResponse.fields.ventanaPorBloquear)
        return ventana
    }

    // Código de consulta estado de regla
    const getCarrierIdRegla = async (idRegla) => {
        
        const url = `https://firestore.googleapis.com/v1beta1/projects/${projectID}/databases/(default)/documents/${collection}/${idRegla}?key=${key}`
        
        const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    
        const options = {
            method: 'GET',
            headers,
            redirect: 'no-follow'
        };

        const response = await fetchApi(url,options)
        const parsedResponse = await FireStoreParser(response)
        const carrierId = await parsedResponse.fields.carrierId
        // console.log('getCarrierIdRegla:', parsedResponse.fields.carrierId)
        return carrierId
    }

    // Código de consulta estado de regla
    const getCantidadPedidosRegla = async (idRegla) => {
        
        const url = `https://firestore.googleapis.com/v1beta1/projects/${projectID}/databases/(default)/documents/${collection}/${idRegla}?key=${key}`
        
        const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    
        const options = {
            method: 'GET',
            headers,
            redirect: 'no-follow'
        };

        const response = await fetchApi(url,options)
        const parsedResponse = await FireStoreParser(response)
        const cantidad = await parsedResponse.fields.cantidadDePedidos
        // console.log('cantidad de pedidos en la regla:', cantidad)
        return cantidad
    }
    
    // Código de edicion estado de regla: ejecutada
    const setReglaEjecutada = async (idRegla) => {
            
            const data = {
                estado: "ejecutada"
            }

            db.collection("reglaBloqueo")
                .doc(idRegla)
                .update(data)
                .then(res => {
                    console.log("Cambio guardado exitosamente:", res)
                    return res
                })
                .catch(function(error) {
                    console.error("Error escribiendo el doc:", error);
                });

    }

    // Código de consulta de todas las reglas activas
    const getReglasActivas = async () => {
        try {
            let coleccion = db.collection("reglaBloqueo")
            let query = await coleccion.where('estado','==','activa').get()
            let response = []
            for(const q of query.docs){
                // console.log(res.id, '=>', res.data());
                datos = q.data
                // console.log('q:', q)
                response.push(datos)
                // console.log('datos: ', datos)
            }
            return response
            
        } catch (error) {
            console.log('Error recibiendo las reglas', error);
        }
    }

    // Código de consulta de todas las reglas activas
    const getReglasActivasFetchAPI = async () => {
        
        // Endpoint API POST Firestore para hacer update de un registro en la coleccion reglaBloqueo
        const url = `https://firestore.googleapis.com/v1beta1/projects/${projectID}/databases/(default)/documents/${collection}?key=${key}`

        const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    
        const options = {
            method: 'GET',
            headers,
            redirect: 'no-follow'
        }

        const response = await fetchApi(url,options)
        const parsedResponse = await FireStoreParser(response)
        const arrayDocs = await parsedResponse.documents
        // console.log(parsedResponse.documents)
        let filteredResponse = null
        for(doc of arrayDocs) {
            let estado = doc.fields.estado
            // console.log(estado)
            if(estado == 'activa') {
                if(filteredResponse == null ) {
                    filteredResponse = new Array();
                }
                filteredResponse.push(doc)
            }
        }
        // console.log('Reglas activas: ', filteredResponse)
        return filteredResponse
    }

    // Código de consulta de reglas activas por carrier
    const getReglasActivasPorCarrierId = async (carrierId) => {
        
        // Endpoint API POST Firestore para hacer update de un registro en la coleccion reglaBloqueo
        const url = `https://firestore.googleapis.com/v1beta1/projects/${projectID}/databases/(default)/documents/${collection}?key=${key}`

        const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    
        const options = {
            method: 'GET',
            headers,
            redirect: 'no-follow'
        };

        const response = await fetchApi(url,options)
        const parsedResponse = await FireStoreParser(response)
        // console.log('parserdResponse', parsedResponse)
        
        const filteredResponse = await Object.filter(parsedResponse.documents, res => res.fields.estado == 'activa')
        // console.log('getReglasActivasPorCarrierId:', filteredResponse)
        return filteredResponse
    }


    // Kick off the job
    const job = schedule.scheduleJob(rule10mins, function() {
        console.log(Date())
        mainJob()
    });
},

init: function() {
    APP.scheduleJob()
    console.log('Service Worker iniciado')
    
}
};

(function(){
APP.init();
})();
