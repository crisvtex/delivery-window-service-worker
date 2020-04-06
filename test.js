// Reference the node-schedule npm package.
const schedule = require('node-schedule');
const FireStoreParser = require('firestore-parser')
const fetch = require('node-fetch')

// constantes globales
const projectID = 'bloqueo-de-ventanas'
const key = 'AIzaSyC0AOhmIGX6rQpDJaHoenbnBrjUUrKr_T8'
const collection = 'reglaBloqueo'
const doc = 'pFaSexNe4jhQcNKMpY61'

// funcion helper para los requests API asíncronos
const fetchApi = async (url, options) => { 
    const response = await fetch(url, options)
    const data = await response.json()
    //console.log(data)
    return data
}


const setReglaEjecutada = async (idRegla) => {
        
    // Endpoint API PATCH Firestore para hacer update de un registro en la coleccion reglaBloqueo
    const url = `https://firestore.googleapis.com/v1beta1/projects/${projectID}/databases/(default)/documents/${collection}/${idRegla}?key=${key}&updateMask.fieldPaths=estado`

    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    

    const options = {
        method: 'PATCH',
        redirect: 'no-follow',
        headers,
        body: '{  }'
    };

    console.log(url)
    console.log(options)

    const response = await fetchApi(url,options)
    const parsedResponse = await FireStoreParser(response)
    console.log('respuesta', parsedResponse)
    return parsedResponse
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
    console.log('respuesta', parsedResponse)
    return parsedResponse.fields
}


// getEstadoRegla(doc)

setReglaEjecutada(doc)





var db = firebase.firestore();
​
function storeData() {
var inputText = document.getElementById("text_field").value;
db.collection("reglaBloqueo")
    .doc()
    .set({
    accountId: "vtexchileqa",
    cantidadDePedidos: 20,
    carrierId: "2",
    estado: "activa",
    fechaDeCreacion: "2020-01-09T08:00:00",
    orderId: inputText,
    ventanaPorBloquear: "2020-01-09T08:00:00"
    })
    .then(function() {
    console.log("doc guardado exitosamente");
    })
    .catch(function(error) {
    console.error("Error escribiendo el doc:", error);
    });
}









// Código de edicion estado de regla: ejecutada
const setReglaEjecutada = async (idRegla) => {
                
    // Endpoint API PATCH Firestore para hacer update de un registro en la coleccion reglaBloqueo
    const url = `https://firestore.googleapis.com/v1beta1/projects/${projectID}/databases/(default)/documents/${collection}/${idRegla}?key=${key}&updateMask.fieldPaths=estado`

    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    const options = {
        method: 'PATCH',
        redirect: 'no-follow',
        headers,
        body: '{ "estado": "ejecutada" }'
    };

    console.log(url)
    console.log(options)

    const response = await fetchApi(url,options)
    const parsedResponse = await FireStoreParser(response)
    console.log('respuesta', parsedResponse)
    return parsedResponse
}





curl --location --request PATCH 'https://firestore.googleapis.com/v1beta1/projects/bloqueo-de-ventanas/databases/(default)/documents/reglaBloqueo/pFaSexNe4jhQcNKMpY61?updateMask.fieldPaths=estado' \
--data-raw '{ fields: {estado: {"ejecutada"}} }'