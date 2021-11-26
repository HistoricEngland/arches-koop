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

    const layerName = req.params.id
    const host = req.params.host
    const method = req.params.method || "none"
    
    const objectIds = query.objectIds || "none"
    const outFields = query.outFields || "none"
    const xmin = query.geometry?.xmin || "none"
    const ymin = query.geometry?.ymin || "none"
    const xmax = query.geometry?.xmax || "none"
    const ymax = query.geometry?.ymax || "none"
    const in_srid = query.geometry?.spatialReference?.wkid || "none"
    const limit = query.resultRecordCount || "none"
    const geometryType = query.geometryType || "none"
    key = `${host}::${layerName}::${method}::${objectIds}::${outFields}::${xmin}::${ymin}::${xmax}::${ymax}::${in_srid}::${limit}::${geometryType}`
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

    if (limit){
        qs.limit = limit;
    }

    if (outfields == "OBJECTID"){
        qs.nodegroups = ""
    }

    if (objectIds){
        qs.objectids = objectIds
    }

    if (query.geometry){
        qs.method = 'bbox'
        if (query.geometryType == "esriGeometryEnvelope"){
           qs.xmin = query.geometry.xmin
           qs.ymin = query.geometry.ymin
           qs.xmax = query.geometry.xmax
           qs.ymax = query.geometry.ymax
           qs.in_srid = query.geometry.spatialReference.wkid
        }
        else{
            qs.geometryTypeTest = query.geometryType
        }
    }
    else{
        if(method == 'query'){
            qs.method == "query_no_bbox";
        }
    }

    qs.precision = 6
    qs.simplify = true

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
        "ttl": config.cacheTimeout,
        "metadata" : {
            "name": layerName,
            "displayField": qs.displayField,
            "title": 'Koop Arches Provider',
            "geometryType": geometryType,
            "idField": 'OBJECTID',
            "fields": fieldset,
            "outSR": { "wkid": 4326, "latestWkid": 4326 }
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
