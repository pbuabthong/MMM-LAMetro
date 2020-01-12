var request = require('request');
var fs = require('fs');
var NodeHelper = require('node_helper');

var ptHelper = require('./pt_helper.js');

var stopInfo;
var config;

var baseURL = 'https://api.metro.net/agencies/lametro/';

module.exports = NodeHelper.create({

	start: function() {
		console.log('Starting LAMetro node helper');
	},

	getStopIDFromStopCode: function(stopCode) {
		// Placeholde in case stopCode != stopID in some transit agencies
		return stopCode;
	},

	getStopNameFromStopCode: function(stopCode, callback) {
		// Example: https://api.metro.net/agencies/lametro/stops/9911/
		request({
			url: baseURL+'stops/'+stopCode+'/',
			json: 'true'
		}, (err, response, body) => {
			if (!err && response.statusCode == 200) {
				callback(body.display_name);
			} else {
				callback();
			}
		});
	},

	getDeparturesByStopCode: function(stopCode) {
		// get ETA from a single StopID
		return new Promise((resolve, reject) => {
			stopID = this.getStopIDFromStopCode(stopCode);

			// get an array of bus route and route name arriving at this station
			// Example: https://api.metro.net/agencies/lametro/stops/3664/routes/
			var busInfo = {};
			request({
				url: baseURL+'stops/'+stopCode+'/routes/',
				json:true
			}, function(err, response, body) {
				if (!err && response.statusCode == 200) {
					body.items.forEach((bus) => {
						var routeID = Number(bus.id);
						var busDisplayName = bus.display_name;
						var routeName = busDisplayName.substr(busDisplayName.search(' ')+1);
						busInfo[routeID] = routeName;
					});

					// get a json array of ETA
					// Example: https://api.metro.net/agencies/lametro/stops/3664/predictions/
					request({
						url: baseURL+'stops/'+stopCode+'/predictions/',
						json:true
					},
					function(err, response, body) {
						if (!err && response.statusCode == 200) {
							result = body;
							departures = [];
							if(result.items) {
								result.items.forEach((route) => {
									// add new departure time to the departure array
									departures.push({
										'routeNo': route.route_id,
										'routeName': busInfo[route.route_id],
										'ETA': route.minutes
									});
								});
							} else {
								console.log('No arrival');
							}

							ptHelper.sortETA(departures);
							resolve(departures);
						} else {
							console.log(err);
							reject([]);
						}
					});

				} else {
					reject([]);
					console.log('reading response from api: error');
				}
			});
		});
	},

	getAllDeparturesByStopCode: function(stopCode) {
		var self = this;
		this.getStopNameFromStopCode(stopCode, (stopName) => {
			console.log(stopName);
			// get ETA from a given StopID AND the stop across the street
			this.getDeparturesByStopCode(stopCode)
				.then((departures) => {
					this.sendSocketNotification('DEPARTURES', {
						stop_code: stopCode,
						stop_name: stopName,
						departures: departures,
					});
				})
				.catch((err) => {
					console.log(err);
					this.sendSocketNotification('DEPARTURES', {
						stop_code: stopCode,
						stop_name: stopName,
						departures: [],
					});
				});
		});
	},

	socketNotificationReceived: function(notification, payload) {
		var self = this;
		console.log('Notification: ' + notification + ' Payload: ' + payload);
		config = payload.config;
		if(notification === 'GET_DEPARTURE') {
			this.getAllDeparturesByStopCode(payload.config.stopCode);
		}
	}
});
