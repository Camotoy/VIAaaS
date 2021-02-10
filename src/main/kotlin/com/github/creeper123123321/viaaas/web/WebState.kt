package com.github.creeper123123321.viaaas.web

interface WebState {
    suspend fun start(webClient: WebClient)
    suspend fun onMessage(webClient: WebClient, msg: String)
    suspend fun disconnected(webClient: WebClient)
    suspend fun onException(webClient: WebClient, exception: java.lang.Exception)
}