const google = require('googleapis');
var _=require('lodash');
var nconf = require('nconf');

var projectId = "bpost-bi";
var tableId = "job_history";
var datasetId = "job_stats";

nconf.use('file', { file: './config.json' });
nconf.load();

var last_max_ts=nconf.get('last_max_ts');
if(!last_max_ts) {
        var last_page=false;
        last_max_ts=0;
        nconf.set('last_max_ts',last_max_ts);
}

const bigquery = google.bigquery('v2');

var bq_insert = function(authClient, rows){
  var request = {
    projectId: projectId,
    datasetId: datasetId,
    tableId: tableId,
    resource: {
      "kind": "bigquery#tableDataInsertAllRequest",
      "skipInvalidRows": true,
      "ignoreUnknownValues": true,
      "templateSuffix": null,
      "rows": rows
    },
    auth: authClient
  };

  bigquery.tabledata.insertAll(request, function(err, result) {
    if (err) {
      console.log(err);
    } else {
      console.log(result);
    }
  });
}


google.auth.getApplicationDefault(function(err, authClient) {
  if (err) {
    console.log('Authentication failed because of ', err);
    return;
  }
  if (authClient.createScopedRequired && authClient.createScopedRequired()) {
    var scopes = ['https://www.googleapis.com/auth/cloud-platform'];
    authClient = authClient.createScoped(scopes);
  }

  var request = {
    projectId: projectId,
    allUsers: true,
    //maxResults:5,
    stateFilter: "done",
    projection: "full",
    auth: authClient
  };


  var recur = function(err, result) {
    if (err) {
      console.log(err);
    } else {
        var last_page=false;
        var insert_rows=[];
        _.each(result.jobs,function(job){
                if(job.statistics.creationTime>nconf.get('last_max_ts')) nconf.set('last_max_ts',job.statistics.creationTime);

                if(job.statistics.creationTime>last_max_ts){
                  console.log("Inserting", job.id);
                  if(!job.errorResult && job.configuration.query){
                    try {
                      var row={
                        "insertId": job.id,
                        "json": {
                          "id": job.id,
                          "kind": job.kind,
                          "user_email": job.user_email,
                          "jobReference": job.jobReference,
                          "state": job.state,
                          "configuration":{
                            "query":{
                              "query":job.configuration.query.query
                            }
                          },
                          "statistics":{
                             "creationTime": job.statistics.creationTime,
                             "startTime": job.statistics.startTime,
                             "endTime": job.statistics.endTime,
                             "totalBytesProcessed": job.statistics.totalBytesProcessed,
                             "query":{
                               "totalBytesProcessed": job.statistics.query.totalBytesProcessed,
                               "totalBytesBilled": job.statistics.query.totalBytesBilled,
                               "billingTier": job.statistics.query.billingTier,
                               "cacheHit": job.statistics.query.cacheHit,
                               "referencedTables": job.statistics.query.referencedTables
                             }
                          }
                        }
                      };
                      insert_rows.push(row);
                    }
                    catch (e) {
                      console.log("Failed Inserting", JSON.stringify(job));
                    }
                  }
                } else {
                        last_page=true;
                }
}
);

if(insert_rows.length>0) bq_insert(authClient,insert_rows);
      if (!last_page && result.nextPageToken) {
        request.pageToken = result.nextPageToken;
        bigquery.jobs.list(request, recur);
      } else {
          nconf.save(function (err) {
    if (err) {
      console.error(err.message);
      return;
    }
    console.log('Configuration saved successfully.');
  });
        }
    }
  };

  bigquery.jobs.list(request, recur);
});