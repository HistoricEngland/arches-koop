const request = require('request').defaults({
    gzip: true,
    json: true
})
const config = require('config')
const geometryTypes = [
    'Point',
    'LineString',
    'Polygon',
    'MultiPoint',
    'MultiLineString',
    'MultiPolygon'
]

function Model(koop) { }

Model.prototype.createKey = function (req) {
    const query = req.query
    params = []

    params.push(req.params.id || "none")
    params.push(req.params.host|| "none")
    params.push(req.params.method || "none")
    params.push(query.outFields || "none")
    params.push(query.geometry?.xmin || "none")
    params.push(query.geometry?.ymin || "none")
    params.push(query.geometry?.xmax || "none")
    params.push(query.geometry?.ymax || "none")
    params.push(query.geometry?.spatialReference?.wkid || "none")
    params.push(query.resultRecordCount || "none")
    params.push(query.geometryType || "none")
    params.push(query.maxAllowableOffset || "none")
    params.push(query.geometryPrecision || "none")
    params.push(query.outSR?.latestWkid || query.outSR?.wkid ||  query.outSR || "none")
    params.push(query.returnGeometry || true)
    params.push(query.returnCountOnly || false)
    params.push(query.resultOffset || "none")

    key = params.join("::")
    console.log(key)
    return key
}

Model.prototype.getData = function (req, callback) {
    const query = req.query
    const layerName = req.params.id
    const host = req.params.host
    const method = req.params.method || null
    const qs = Object.assign({}, config.archesHosts[host].layers[layerName])
    const geometryType = qs.type || geometryTypes[req.params.layer]
    const outfields = query.outFields || ""
    const limit = query.resultRecordCount || null
    const objectIds = query.objectIds || null
    const maxAllowableOffset = query.maxAllowableOffset || -1
    const geometryPrecision = query.geometryPrecision || 6
    const inSR = query.geometry?.spatialReference?.wkid || 4326
    const outSR = query.outSR?.latestWkid || query.outSR?.wkid ||  query.outSR || 4326
    const returnCountOnly = query.returnCountOnly || false
    const returnGeometry = query.returnGeometry || !returnCountOnly
    
    qs.source = "koop"

    let hasOffSet = false
    if (query.resultOffset){
        qs.offset = query.resultOffset
        hasOffSet = true
    } 
    else { 
        qs.offset = -1
    }

    if (limit) qs.limit = limit;

    if (outfields == "OBJECTID") qs.nodegroups = "";
    if (objectIds) qs.objectids = objectIds;

    let geometryFilter = false
    if (query.geometry){
        if (query.geometryType == "esriGeometryEnvelope"){
            geometryFilter = true
            qs.xmin = query.geometry.xmin
            qs.ymin = query.geometry.ymin
            qs.xmax = query.geometry.xmax
            qs.ymax = query.geometry.ymax
            qs.in_srid = inSR
        }
    }

    qs.precision = geometryPrecision
    qs.simplify = maxAllowableOffset
    qs.outSR = outSR
    qs.returnGeometry = returnGeometry
    qs.returnCountOnly = returnCountOnly
    
    let propertyMap = {}
    if (qs.properties) {
        propertyMap = qs.properties
        delete qs.properties
    }
    qs.type = geometryType

    //required fields
    let requiredFields = ["resourceinstanceid", "nodeid", "tileid"]
    for (requiredField in requiredFields) {
        let fieldname = requiredFields[requiredField]
        propertyMap[fieldname] = fieldname
    }

    fieldset = []

    fieldset.push({
        "name": "OBJECTID",
        "type": "esriFieldTypeOID",
        "alias": "OBJECTID",
        "sqlType": "sqlTypeInteger",
        "domain": null,
        "defaultValue": null,
        "editable": false,
        "nullable": false
    });

    if (propertyMap) {
        for (property in propertyMap) {
            fieldset.push({
                "name": propertyMap[property],
                "type": "esriFieldTypeString",
                "alias": propertyMap[property],
                "sqlType": "sqlTypeOther",
                "domain": null,
                "defaultValue": null,
                "length": 128,
                "editable": false,
                "nullable": false
            });
        }
    }
    
    feature_service_obj = {
        "type":"FeatureCollection",
        "features": [],
        //"ttl": config.cacheTimeout,
        "metadata" : {
            "name": layerName,
            "displayField": qs.displayField,
            "title": 'Koop Arches Provider',
            "geometryType": geometryType,
            "idField": 'OBJECTID',
            "fields": fieldset
        }
    }

    


    switch (method){
        case "query":
            request({
                url: `${config.archesHosts[host].url}/geojson`,
                qs: qs
            }, (err, res, geojson) => {
                if (err) return callback(err);
                try {

                    feature_service_obj.filtersApplied = {
                        all: false, // true if all post processing should be skipped
                        geometry: geometryFilter, // true if a geometric filter has already been applied to the data
                        where: false, // true if a sql-like where filter has already been applied to the data
                        offset: hasOffSet, // true if the result offset has already been applied to the data,
                        limit: (limit !== null), // true if the result count has already been limited,
                        projection: true // true if the result data has already been projected
                    }

                    geojson.features.forEach(function (feature) {
                        if (qs.nodeid) feature.properties.nodeid = qs.nodeid;
            
                        if (propertyMap) {
                            let properties = {};
                            for (let incomingKey in propertyMap) {
                                let outgoingKey = propertyMap[incomingKey];
                                if (Array.isArray(feature.properties[incomingKey])) {
                                    properties[outgoingKey] = feature.properties[incomingKey].join(',');
                                }
                                else {
                                    properties[outgoingKey] = feature.properties[incomingKey] || null;
                                }
                            }
                            feature.properties = properties;
                        }
                        feature.properties.id = feature.id;
                        feature.properties.OBJECTID = feature.properties.id;
                        delete feature.properties.id;
                        feature_service_obj.features.push(feature);

                    });

                } catch (error) {
                    
                }
                
                callback(null, feature_service_obj);
            })
            break;
        default:
            //just pass back service definition
            callback(null, feature_service_obj);
    }
    
}

module.exports = Model
